"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  lookupResultSchema,
  submitResultSchema,
  type LookupResult,
  type ServiceRequestPayload,
} from "@/lib/service-requests/schema";

// 사업자번호 조회 — anon RPC. 등록고객이면 회사+보유장비 반환, 미등록이면 null.
// biz_no는 표시·UX용 정규화만; 실제 검증은 submit RPC가 재수행.
export async function lookupCompany(bizNo: string): Promise<LookupResult | null> {
  const digits = bizNo.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lookup_company_by_biz_no", { p_biz_no: digits });
  if (error) {
    console.error("[support.lookup] rpc 실패", error);
    return null;
  }
  if (data == null) return null;
  const parsed = lookupResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[support.lookup] 응답 형식 오류", parsed.error);
    return null;
  }
  return parsed.data;
}

// A/S 제출 — 서버 강제 검증은 RPC가 수행. 반환 seq_no(+담당자명) → 완료화면.
export async function submitServiceRequest(
  payload: ServiceRequestPayload,
): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_service_request", { payload });
  if (error) {
    console.error("[support.submit] rpc 실패", error);
    return { error: "A/S 신청 저장에 실패했습니다. 입력값을 확인해주세요." };
  }
  const parsed = submitResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[support.submit] 응답 형식 오류", data);
    return { error: "접수번호 생성에 실패했습니다." };
  }
  const q = new URLSearchParams({ no: parsed.data.seq_no });
  if (parsed.data.assignee_name) q.set("assignee", parsed.data.assignee_name);
  redirect(`/support/success?${q.toString()}`);
}
