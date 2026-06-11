import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CustomerHistory } from "./history";
import type { CustomerListParams } from "./list-table";


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


// ── 고객 목록 테이블(개편) — companies_list 뷰 기반 서버사이드 검색·필터·정렬·페이지네이션 ──

export interface CustomerListRow {
  id: string;
  name: string;
  ledger_no: number | null;
  biz_no: string | null;
  ceo: string | null;
  manager: string | null;
  phone: string | null;
  phone1: string | null;
  mobile: string | null;
  region: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  quotes_count: number;
  equipment_count: number;
  as_count: number;
  activity_at: string | null;
}

// 통합 검색 OR 절 — 업체명·장부명·대표자·담당자(ilike) + 숫자검색(search_digits, 하이픈 무시) + 장부번호(eq).
function buildListSearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (!cleaned) return null;
  const parts = [
    `name.ilike.%${cleaned}%`,
    `ledger_name.ilike.%${cleaned}%`,
    `ceo.ilike.%${cleaned}%`,
    `manager.ilike.%${cleaned}%`,
  ];
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 3) parts.push(`search_digits.ilike.%${digits}%`);
  if (/^\d+$/.test(cleaned) && cleaned.length <= 9) parts.push(`ledger_no.eq.${cleaned}`);
  return parts.join(",");
}

/** 고객 목록 1페이지 + 필터 적용 총건수(count exact 동일 쿼리). */
export async function getCustomers(
  params: CustomerListParams & { userId: string },
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("companies_list")
    .select(
      "id,name,ledger_no,biz_no,ceo,manager,phone,phone1,mobile,region,assignee_id,assignee_name,quotes_count,equipment_count,as_count,activity_at",
      { count: "exact" },
    );
  if (params.q) {
    const or = buildListSearchOr(params.q);
    if (or) query = query.or(or);
  }
  if (params.region) query = query.eq("region", params.region);
  if (params.sales === "none") query = query.is("assignee_id", null);
  else if (params.sales) query = query.eq("assignee_id", params.sales);
  if (params.quick === "trading") query = query.gt("equipment_count", 0);
  if (params.quick === "unassigned") query = query.is("assignee_id", null);
  if (params.quick === "recent") {
    query = query.gte("activity_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  }
  // 정렬 — 기본 최근활동 최신순(활동 없음은 뒤로). 2차 키 name으로 안정화.
  if (params.sort === "name") query = query.order("name", { ascending: params.dir === "asc" });
  else if (params.sort === "region") query = query.order("region", { ascending: params.dir === "asc", nullsFirst: false }).order("name");
  else query = query.order("activity_at", { ascending: params.dir === "asc", nullsFirst: false }).order("name");
  const from = (params.page - 1) * params.pp;
  const { data, error, count } = await query.range(from, from + params.pp - 1);
  if (error) { console.error("[customers.listTable]", error); return { rows: [], total: 0 }; }
  return { rows: (data ?? []) as unknown as CustomerListRow[], total: count ?? 0 };
}

/** KPI 빠른 필터 카운트 — 전체/거래중(장비 보유)/미배정/최근 30일 활동. */
export async function customerKpiCounts(): Promise<{
  total: number; trading: number; unassigned: number; recent: number;
}> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const head = { count: "exact" as const, head: true };
  const [t, tr, un, re] = await Promise.all([
    supabase.from("companies_list").select("id", head),
    supabase.from("companies_list").select("id", head).gt("equipment_count", 0),
    supabase.from("companies_list").select("id", head).is("assignee_id", null),
    supabase.from("companies_list").select("id", head).gte("activity_at", since),
  ]);
  for (const r of [t, tr, un, re]) if (r.error) console.error("[customers.kpi]", r.error);
  return {
    total: t.count ?? 0,
    trading: tr.count ?? 0,
    unassigned: un.count ?? 0,
    recent: re.count ?? 0,
  };
}

/** 지역 Select 옵션 — 뷰의 region distinct(가시 범위 기준). */
export async function listCustomerRegions(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  // PostgREST는 distinct 미지원 → region만 전량(최대 행수 내) 받아 dedupe. 17개 고정이라 비용 미미.
  const { data, error } = await supabase.from("companies_list").select("region").not("region", "is", null).limit(10000);
  if (error) { console.error("[customers.regions]", error); return []; }
  return Array.from(new Set((data ?? []).map((r) => r.region as string))).sort();
}
