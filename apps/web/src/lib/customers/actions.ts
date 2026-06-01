"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PostgrestError } from "@supabase/supabase-js";
import { normalizeBizNo } from "@jhtechsaas/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomersManage } from "@/lib/auth/guard";
import { companyFormSchema, type CompanyFormValues } from "@/lib/customers/schema";
import { diffEquipment } from "@/lib/customers/equipment-diff";

export type CustomerActionResult = { error: string } | null;

// 보유장비 diff-upsert — 삭제→업데이트→신규 순서로 적용. 에러 시 메시지 반환.
// diff 순수 로직은 equipment-diff.ts(non-server). 여기선 DB 적용만.
async function applyEquipmentDiff(supabase: SupabaseClient, companyId: string, values: CompanyFormValues): Promise<string | null> {
  const { data: existingRows, error: exErr } = await supabase.from("company_equipment").select("id").eq("company_id", companyId);
  if (exErr) return exErr.message;
  const { toDelete, toUpdate, toInsert } = diffEquipment(companyId, (existingRows ?? []).map((r: { id: string }) => r.id), values.equipment);
  if (toDelete.length) {
    const { error } = await supabase.from("company_equipment").delete().in("id", toDelete);
    if (error) return error.message;
  }
  // 제출된 id 중 이 회사 소속 행만 업데이트(cross-company 행 조작 방지).
  // RLS는 customers.manage만 검사하고 row 소유는 안 보므로 company_id 스코프를 앱에서 강제.
  const ownedIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    if (!ownedIds.has(id)) continue; // 타 회사/위조 id는 무시
    const { error } = await supabase
      .from("company_equipment")
      .update(rest)
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) return error.message;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("company_equipment").insert(toInsert);
    if (error) return error.message;
  }
  return null;
}

// 업체 row 변환 — 빈 문자열은 null로 저장(선택 필드 일관성).
function companyRow(v: CompanyFormValues) {
  return {
    name: v.name,
    biz_no: v.biz_no ? normalizeBizNo(v.biz_no) : null,
    ceo: v.ceo || null,
    phone: v.phone || null,
    email: v.email || null,
    address: v.address || null,
    note: v.note || null,
    assignee_id: v.assignee_id || null,
  };
}

// 23505(unique violation) 여부 확인 — PostgrestError.code는 string 타입으로 정의됨.
function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === "23505";
}

// 업체 신규 등록. id는 클라에서 미리 생성한 UUID(uuid()). 장비 저장 실패 시 보상 삭제.
export async function createCustomer(id: string, values: CompanyFormValues): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("companies").insert({ id, ...companyRow(v) });
  if (error) {
    if (isUniqueViolation(error)) return { error: "이미 등록된 사업자번호입니다." };
    console.error("[customers.create] insert 실패", error);
    return { error: "저장하지 못했습니다." };
  }
  const eqErr = await applyEquipmentDiff(supabase, id, v);
  if (eqErr) {
    // 보상 삭제: 장비 저장 실패 시 방금 생성한 업체 row 제거(고아 방지 + 동일 id 재시도 가능).
    console.error("[customers.create] 장비 저장 실패, 보상 삭제", eqErr);
    await supabase.from("companies").delete().eq("id", id);
    return { error: "보유장비를 저장하지 못했습니다." };
  }
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}/edit`);
}

// 업체 정보 수정. 0행 업데이트 = 동시 삭제 감지.
export async function updateCustomer(id: string, values: CompanyFormValues): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").update(companyRow(v)).eq("id", id).select("id");
  if (error) {
    if (isUniqueViolation(error)) return { error: "이미 등록된 사업자번호입니다." };
    console.error("[customers.update] update 실패", error);
    return { error: "저장하지 못했습니다." };
  }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  const eqErr = await applyEquipmentDiff(supabase, id, v);
  if (eqErr) { console.error("[customers.update] 장비 저장 실패", eqErr); return { error: "보유장비를 저장하지 못했습니다." }; }
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

// 업체 삭제. company_equipment는 FK cascade로 자동 삭제.
export async function deleteCustomer(id: string): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").delete().eq("id", id).select("id");
  if (error) { console.error("[customers.delete] delete 실패", error); return { error: "삭제하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

// 견적 신청에서 고객 자동 등록 — upsert_company_from_application RPC 위임.
export async function registerFromApplication(applicationId: string): Promise<{ error: string } | { company_id: string; created: boolean }> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_from_application", { p_application_id: applicationId });
  if (error) { console.error("[customers.registerFromApp]", error); return { error: "고객 등록에 실패했습니다." }; }
  // 외부(RPC) 응답은 직접 신뢰 금지 — Zod로 형태 검증(CLAUDE.md).
  const parsed = z.object({ company_id: z.string().uuid(), created: z.boolean() }).safeParse(data);
  if (!parsed.success) { console.error("[customers.registerFromApp] RPC 응답 형식 오류", data); return { error: "고객 등록 응답이 올바르지 않습니다." }; }
  return parsed.data;
}

// 견적 신청 검색 서버 액션 — ApplicationPicker(클라이언트)에서 호출.
// queries.ts는 server-only라 직접 import 불가 → server action으로 래핑.
export async function searchApplicationsAction(query: string): Promise<{ error: string } | unknown[]> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  const { searchApplicationsForCustomer } = await import("@/lib/customers/queries");
  return searchApplicationsForCustomer(query);
}
