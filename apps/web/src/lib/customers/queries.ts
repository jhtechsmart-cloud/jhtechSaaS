import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerHistory } from "./history";

// 업체 목록 행 — 목록 페이지 표시용 집약 타입.
export interface CompanyListRow {
  id: string;
  name: string;
  biz_no: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  equipment_count: number;
  updated_at: string;
}

// 업체 목록 — 최신순. RLS: 본인 담당 고객(assignee) 또는 customers.view_all 보유자만.
// profiles 임베드 조인(assignee_id → profiles.name) + company_equipment count 조인.
// ⚠️ profiles 테이블 display_name 없음 → name 컬럼 사용(20260529150001_auth_profiles.sql 확인).
export async function listCompanies(): Promise<CompanyListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,biz_no,assignee_id,updated_at,profiles:assignee_id(name),company_equipment(count)")
    .order("updated_at", { ascending: false });
  if (error) { console.error("[customers.list]", error); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => {
    const profiles = r.profiles as { name?: string } | null;
    const ceArr = r.company_equipment as Array<{ count: number }> | null;
    return {
      id: r.id as string,
      name: r.name as string,
      biz_no: r.biz_no as string | null,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      equipment_count: ceArr?.[0]?.count ?? 0,
      updated_at: r.updated_at as string,
    };
  });
}

// 업체 단건 — 보유장비 포함 전체 데이터. 수정 폼에서 사용.
export async function getCompany(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("*, company_equipment(*)")
    .eq("id", id)
    .single();
  return data;
}

// 업체 상세(P-F) — 헤더·보유장비 표시용. company_equipment에 장비명/모델 조인(equipment XOR label).
// ⚠️ profiles 조인(담당자명)은 viewer가 admin(users.manage) 아니면 RLS상 null일 수 있음(목록과 동일 한계).
export async function getCompanyDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("*, profiles:assignee_id(name), company_equipment(*, equipment(name, model))")
    .eq("id", id)
    .single();
  return data;
}

// 통합 고객이력(P-F) — 견적·AS·소모품을 DEFINER RPC로 한 번에(customers.view_all 또는 본인 담당 고객 게이트).
// 견적은 biz_no 정규화 OR source_application_id 매칭. 업체+장비는 getCompany로 별도(병렬 호출 권장).
export async function getCustomerHistory(id: string): Promise<CustomerHistory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_request_history", {
    p_company_id: id,
  });
  // 신뢰 소스 페이지 — 장애를 "내역 없음"으로 위장하면 안 됨(빈 배열 반환 금지). 던져서 에러바운더리로.
  if (error) {
    console.error("[customers.history]", error);
    throw new Error(`고객 이력 조회 실패: ${error.message}`);
  }
  return (data ?? {
    applications: [],
    service_requests: [],
    supply_requests: [],
  }) as CustomerHistory;
}

// 담당자 선택 목록 — is_active=true인 스태프만. 폼 select 옵션에 사용.
export async function listAssignableStaff() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

// 고객 등록용 견적 검색 — 사업자번호·업체명·접수번호로 신청 건을 찾아 고객 자동 등록에 활용.
export async function searchApplicationsForCustomer(query: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_applications_for_customer", { p_query: query });
  if (error) { console.error("[customers.searchApps]", error); return []; }
  return data ?? [];
}
