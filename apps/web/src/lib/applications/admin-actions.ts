"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import { applicationStatusSchema } from "./status-schema";
import { nextStatusOnAssign } from "./assign-logic";
import type { ApplicationStatus } from "@/lib/customers/history";

export type ApplicationActionResult = { error: string } | { ok: true; companyId?: string };

const FAIL = "처리에 실패했습니다(권한이 없거나 대상이 없습니다)";

// 담당 배정 — applications.assign 필요. new면 assigned로, 해제(null)면 assigned→new auto-bump.
export async function assignApplication(
  id: string,
  assigneeId: string | null,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("applications.assign");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const supabase = await createSupabaseServerClient();

  // 현재 status 조회 → auto-bump 판정. (단일테넌트 admin=users.manage라 SELECT 가능.)
  const { data: cur } = await supabase
    .from("applications").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "신청을 찾을 수 없습니다" };

  const patch: { assignee_id: string | null; status?: string } = { assignee_id: assigneeId };
  const bumped = nextStatusOnAssign(cur.status as ApplicationStatus, assigneeId);
  if (bumped) patch.status = bumped; // new→assigned(배정) / assigned→new(해제)

  const { data, error } = await supabase
    .from("applications").update(patch).eq("id", id).select("id");
  if (error || !data || data.length === 0) return { error: FAIL };

  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/applications");
  return { ok: true };
}

// 상태 변경 — applications.assign 필요. 자유전이(4상태). 0행이면 거짓성공 대신 에러.
export async function updateApplicationStatus(
  id: string,
  status: string,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("applications.assign");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = applicationStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "유효하지 않은 상태입니다" };
  const supabase = await createSupabaseServerClient();
  // 담당자 미배정이면 상태 변경 차단(UI 가드의 서버 짝 — 직접 POST 방어).
  const { data: cur } = await supabase
    .from("applications").select("assignee_id").eq("id", id).maybeSingle();
  if (!cur) return { error: "신청을 찾을 수 없습니다" };
  if (!cur.assignee_id) return { error: "담당자를 먼저 배정해주세요" };
  const { data, error } = await supabase
    .from("applications").update({ status: parsed.data }).eq("id", id).select("id");
  if (error || !data || data.length === 0) return { error: FAIL };
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/applications");
  return { ok: true };
}

// 미등록 고객 등록 — customers.manage 필요(RPC 내부에서도 재검증). 반환 company_id로 즉시 P-F 링크.
export async function registerCustomerFromApplication(
  id: string,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("customers.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_from_application", {
    p_application_id: id,
  });
  if (error) {
    console.error("[applications.registerCustomer]", error);
    return { error: "고객 등록에 실패했습니다" };
  }
  const companyId = (data as { company_id?: string } | null)?.company_id;
  revalidatePath(`/admin/applications/${id}`);
  return { ok: true, companyId };
}
