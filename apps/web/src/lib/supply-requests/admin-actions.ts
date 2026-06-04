"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import { SUPPLY_REQUEST_STATUSES } from "./status";

export type SupplyRequestActionResult = { error: string } | null;

const statusSchema = z.enum(SUPPLY_REQUEST_STATUSES);

// 상태 변경 — supply_requests.status 필요. terminal(done/canceled) 역행은 DB 트리거가 거부.
export async function updateSupplyRequestStatus(
  id: string,
  status: string,
): Promise<SupplyRequestActionResult> {
  const access = await requirePermission("supply_requests.status");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "유효하지 않은 상태입니다" };
  const supabase = await createSupabaseServerClient();
  // status 보유자도 RLS상 본인 배정 건만 수정 가능 → 비담당 행은 0행(거짓성공 방지).
  const { data, error } = await supabase
    .from("supply_requests").update({ status: parsed.data }).eq("id", id).select("id");
  if (error || !data || data.length === 0) {
    return { error: "상태 변경에 실패했습니다(권한이 없거나 종결된 건입니다)" };
  }
  revalidatePath(`/admin/supply-requests/${id}`);
  revalidatePath("/admin/supply-requests");
  return null;
}

// 미배정 소모품신청을 본인 담당으로 가져오기(self-claim) — supply_requests.claim 필요.
// assignee_id IS NULL 가드로 이미 배정된 건은 0행(거짓성공 방지).
export async function claimSupplyRequest(id: string): Promise<SupplyRequestActionResult> {
  const access = await requirePermission("supply_requests.claim");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("supply_requests").update({ assignee_id: access.userId })
    .eq("id", id).is("assignee_id", null).select("id");
  if (error || !data || data.length === 0) {
    return { error: "이미 배정되었거나 가져올 수 없는 소모품신청입니다" };
  }
  revalidatePath(`/admin/supply-requests/${id}`);
  revalidatePath("/admin/supply-requests");
  return null;
}

// 열람 표시 — supply_requests.view_all 필요. 미열람(NULL)일 때만 기록(멱등).
export async function markSupplyRequestRead(id: string): Promise<void> {
  const access = await requirePermission("supply_requests.view_all");
  if (access.status === "forbidden") return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("supply_requests").update({ admin_read_at: new Date().toISOString() }).eq("id", id).is("admin_read_at", null);
  revalidatePath("/admin/supply-requests");
}
