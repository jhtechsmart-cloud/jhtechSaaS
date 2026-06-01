"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PostgrestError } from "@supabase/supabase-js";
import { normalizeBizNo } from "@jhtechsaas/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomersManage } from "@/lib/auth/guard";
import { companyFormSchema, type CompanyFormValues, type CompanyEquipmentRow } from "@/lib/customers/schema";

export type CustomerActionResult = { error: string } | null;

// DB row 변환 — equipment_id·label 중 빈 값은 null로 저장.
function toDbRow(company_id: string, r: CompanyEquipmentRow) {
  return {
    company_id,
    equipment_id: r.equipment_id || null,
    // label은 카탈로그 장비 없을 때만(XOR 보장): equipment_id 있으면 null 강제.
    label: r.equipment_id ? null : (r.label || null),
    serial_no: r.serial_no || null,
    purchased_at: r.purchased_at || null,
    install_address: r.install_address || null,
  };
}

// id 보존 diff — 삭제·업데이트·신규 삽입을 분리. replace(전량 삭제 후 재삽입) 금지.
// ⚠️ 순수 함수 — 사이드이펙트 없음. equipment-diff.test.ts에서 단위 테스트.
export function diffEquipment(company_id: string, existing: string[], submitted: CompanyEquipmentRow[]) {
  const submittedIds = new Set(submitted.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((id) => !submittedIds.has(id));
  const toUpdate = submitted.filter((r) => r.id).map((r) => ({ id: r.id, ...toDbRow(company_id, r) }));
  const toInsert = submitted.filter((r) => !r.id).map((r) => toDbRow(company_id, r));
  return { toDelete, toUpdate, toInsert };
}

// 보유장비 diff-upsert — 삭제→업데이트→신규 순서로 적용. 에러 시 메시지 반환.
async function applyEquipmentDiff(supabase: SupabaseClient, companyId: string, values: CompanyFormValues): Promise<string | null> {
  const { data: existingRows, error: exErr } = await supabase.from("company_equipment").select("id").eq("company_id", companyId);
  if (exErr) return exErr.message;
  const { toDelete, toUpdate, toInsert } = diffEquipment(companyId, (existingRows ?? []).map((r: { id: string }) => r.id), values.equipment);
  if (toDelete.length) {
    const { error } = await supabase.from("company_equipment").delete().in("id", toDelete);
    if (error) return error.message;
  }
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    const { error } = await supabase.from("company_equipment").update(rest).eq("id", id);
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
  return { company_id: data.company_id as string, created: data.created as boolean };
}
