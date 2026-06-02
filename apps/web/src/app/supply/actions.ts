"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  lookupResultSchema,
  listConsumablesResultSchema,
  lastSupplyResultSchema,
  submitResultSchema,
  type LookupResult,
  type ListConsumablesResult,
  type LastSupplyResult,
  type SupplyRequestPayload,
} from "@/lib/supply-requests/schema";

// 조회 결과 — 미등록(notfound)과 일시 오류(error)를 구분(정상 고객이 네트워크 오류로 "신청불가" 벽 맞는 것 차단).
export type LookupOutcome =
  | { kind: "found"; company: LookupResult }
  | { kind: "notfound" }
  | { kind: "error" };

export async function lookupCompanyForSupply(bizNo: string): Promise<LookupOutcome> {
  const digits = bizNo.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) return { kind: "notfound" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lookup_company_by_biz_no", { p_biz_no: digits });
  if (error) {
    console.error("[supply.lookup] rpc 실패", error);
    return { kind: "error" };
  }
  if (data == null) return { kind: "notfound" };
  const parsed = lookupResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[supply.lookup] 응답 형식 오류", parsed.error);
    return { kind: "error" };
  }
  return { kind: "found", company: parsed.data };
}

// 보유장비 매칭 소모품(장비별 그룹 + 평탄 union). price 미반환. null=오류.
export async function listConsumablesForCompany(bizNo: string): Promise<ListConsumablesResult | null> {
  const digits = bizNo.replace(/\D/g, "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_consumables_for_company", { p_biz_no: digits });
  if (error) {
    console.error("[supply.consumables] rpc 실패", error);
    return null;
  }
  const parsed = listConsumablesResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[supply.consumables] 응답 형식 오류", parsed.error);
    return null;
  }
  return parsed.data;
}

// 직전 신청 items(재주문 프리필). 오류·없음이면 빈 items.
export async function lastSupplyRequestForCompany(bizNo: string): Promise<LastSupplyResult> {
  const digits = bizNo.replace(/\D/g, "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("last_supply_request_for_company", { p_biz_no: digits });
  if (error) {
    console.error("[supply.last] rpc 실패", error);
    return { items: [] };
  }
  const parsed = lastSupplyResultSchema.safeParse(data);
  return parsed.success ? parsed.data : { items: [] };
}

// 소모품 제출 — 서버 강제 검증은 RPC가 수행. 반환 seq_no(+담당자명) → 완료화면.
export async function submitSupplyRequest(
  payload: SupplyRequestPayload,
): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_supply_request", { payload });
  if (error) {
    console.error("[supply.submit] rpc 실패", error);
    return { error: "소모품 신청 저장에 실패했습니다. 입력값을 확인해주세요." };
  }
  const parsed = submitResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[supply.submit] 응답 형식 오류", data);
    return { error: "접수번호 생성에 실패했습니다." };
  }
  const q = new URLSearchParams({ no: parsed.data.seq_no });
  if (parsed.data.assignee_name) q.set("assignee", parsed.data.assignee_name);
  redirect(`/supply/success?${q.toString()}`);
}
