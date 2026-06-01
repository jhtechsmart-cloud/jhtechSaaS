import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

// 업체 목록 — 최신순. RLS: customers.manage 권한 보유자만 접근 가능.
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
