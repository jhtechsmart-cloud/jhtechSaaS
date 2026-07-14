import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/customers/history";
import { ACTIVE_APPLICATION_STATUSES, DONE_APPLICATION_STATUSES } from "@/lib/application-status";
import { buildSearchOr, splitOverflow } from "./admin-search";
import { applicationStatusSchema } from "./status-schema";
import { matchCompany, type CompanyLite, type CompanyMatchKind } from "./company-match";

// 고객 마스터 경량 목록(id·이름·사업자번호) — 견적요청 매칭 대조용 1회 조회.
// 이관 데이터 규모(~1,600행)에서 3컬럼 select는 가볍다. RLS: companies SELECT는 authenticated 전원.
async function loadCompanyLites(): Promise<CompanyLite[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").select("id,name,biz_no");
  if (error) {
    console.error("[applications.companyLites]", error);
    return [];
  }
  return (data ?? []) as CompanyLite[];
}

// 의뢰의 출고의뢰서 건수 — 의뢰 삭제 시 '함께 사라지는 출고의뢰서' 경고용.
export async function countReleaseOrdersForApplication(applicationId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("release_orders")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);
  return count ?? 0;
}

export interface ApplicationListRow {
  id: string;
  seq_no: string;
  status: ApplicationStatus;
  company: string;
  summary: string; // equipment_name || requirements 앞부분 (목록 "무슨 견적인가" 컬럼)
  assignee_id: string | null;
  assignee_name: string | null;
  is_new: boolean; // status==='new' (미배정 강조)
  created_at: string;
  // 고객 마스터 대조 — biz_no=기존 고객(미연결) / name_only=확인 필요(오타 의심) / linked=연결됨.
  match_kind: CompanyMatchKind;
}

const LIST_LIMIT = 100;

// 견적 목록 — created_at desc. 서버 검색(company·seq_no)+상태필터. RLS: 자기배정 OR view_all.
export async function listApplications(
  opts: { q?: string; status?: string } = {},
): Promise<{ rows: ApplicationListRow[]; overflow: boolean }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("applications")
    .select("id,seq_no,status,company,assignee_id,created_at,fields,profiles:assignee_id(name)")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT + 1); // overflow 감지용 +1

  // status는 URL 파라미터 → enum 화이트리스트만 통과(임의값이 0행을 "없음"으로 위장하는 것 차단).
  const safeStatus =
    opts.status && opts.status !== "all" && applicationStatusSchema.safeParse(opts.status).success
      ? opts.status
      : null;
  if (safeStatus) query = query.eq("status", safeStatus);
  const orFilter = opts.q ? buildSearchOr(opts.q) : null;
  if (orFilter) query = query.or(orFilter);

  const { data, error } = await query;
  if (error) {
    console.error("[applications.adminList]", error);
    return { rows: [], overflow: false };
  }
  const mapped: ApplicationListRow[] = (data ?? []).map((r: Record<string, unknown>) => {
    const profiles = r.profiles as { name?: string } | null;
    const fields = (r.fields as { equipment_name?: string; requirements?: string } | null) ?? {};
    const summary = fields.equipment_name ?? (fields.requirements ?? "").slice(0, 40);
    return {
      id: r.id as string,
      seq_no: r.seq_no as string,
      status: r.status as ApplicationStatus,
      company: r.company as string,
      summary,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      is_new: r.status === "new",
      created_at: r.created_at as string,
      match_kind: null, // 레거시(비페이지) 경로 — 고객 대조 미수행(목록 배지는 listApplicationsPage 사용)
    };
  });
  return splitOverflow(mapped, LIST_LIMIT);
}

// 미배정(미처리) 건수 — status='new'. RLS가 가시범위 제한(view_all 없으면 자기배정 new만).
// ⚠️ 단일테넌트 admin(users.manage)은 전체. 멀티스태프 시 "내 배정 new"만 셈(plan에 명문화).
export async function countNewApplications(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) {
    // 신뢰 신호(미배정 배지)가 장애 시 조용히 0이 되는 걸 최소한 로그로 남긴다.
    console.error("[applications.countNew]", error);
    return 0;
  }
  return count ?? 0;
}

// 진행중 스코프 = 수금완료·종료 제외 전부 / 완료 스코프 = 완료군(수금완료+종료). 단일 출처 재사용.
const ACTIVE_STATUSES = ACTIVE_APPLICATION_STATUSES;
const DONE_STATUSES = DONE_APPLICATION_STATUSES;

export type ListScope = "active" | "closed" | "all";

// 페이지네이션 목록 — created_at desc(동률 seq_no desc). q 있으면 스코프 무시 전체검색.
// limit+1 fetch로 hasMore 판정. RLS: 자기배정 OR view_all.
export async function listApplicationsPage(opts: {
  scope: ListScope;
  q?: string;
  offset: number;
  limit: number;
}): Promise<{ rows: ApplicationListRow[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("applications")
    .select("id,seq_no,status,company,biz_no,company_id,assignee_id,created_at,fields,profiles:assignee_id(name)")
    .order("created_at", { ascending: false })
    .order("seq_no", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit); // +1 행으로 hasMore 감지

  const orFilter = opts.q ? buildSearchOr(opts.q) : null;
  if (orFilter) {
    query = query.or(orFilter); // 검색 시 스코프 무시(전체 상태)
  } else if (opts.scope === "active") {
    query = query.in("status", ACTIVE_STATUSES as unknown as string[]);
  } else if (opts.scope === "closed") {
    query = query.in("status", DONE_STATUSES as unknown as string[]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[applications.listPage]", error);
    return { rows: [], hasMore: false };
  }
  const all = (data ?? []) as Record<string, unknown>[];
  const hasMore = all.length > opts.limit;
  const sliced = hasMore ? all.slice(0, opts.limit) : all;
  // 고객 마스터 대조는 페이지당 1회 조회로 일괄 계산(행별 추가 쿼리 금지).
  const companyLites = await loadCompanyLites();
  const rows: ApplicationListRow[] = sliced.map((r) => {
    const profiles = r.profiles as { name?: string } | null;
    const fields = (r.fields as { equipment_name?: string; requirements?: string } | null) ?? {};
    const summary = fields.equipment_name ?? (fields.requirements ?? "").slice(0, 40);
    const match = matchCompany(
      {
        company: (r.company as string | null) ?? null,
        biz_no: (r.biz_no as string | null) ?? null,
        company_id: (r.company_id as string | null) ?? null,
      },
      companyLites,
    );
    return {
      id: r.id as string,
      seq_no: r.seq_no as string,
      status: r.status as ApplicationStatus,
      company: r.company as string,
      summary,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      is_new: r.status === "new",
      created_at: r.created_at as string,
      match_kind: match.kind,
    };
  });
  return { rows, hasMore };
}

// 탭 카운트 — 진행중/완료. RLS 스코프 그대로 적용(영업담당은 자기 가시범위 셈).
export async function countApplicationsByGroup(): Promise<{ active: number; closed: number }> {
  const supabase = await createSupabaseServerClient();
  const [activeRes, closedRes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[]),
    supabase.from("applications").select("id", { count: "exact", head: true })
      .in("status", DONE_STATUSES as unknown as string[]),
  ]);
  if (activeRes.error) console.error("[applications.countActive]", activeRes.error);
  if (closedRes.error) console.error("[applications.countClosed]", closedRes.error);
  return { active: activeRes.count ?? 0, closed: closedRes.count ?? 0 };
}

// 견적 단건(admin 상세) — profiles 조인 + 고객 마스터 대조(matchCompany).
// 반환 company_id = 화면 배지용 "확실한 고객"(DB 연결 링크 우선, 없으면 사업자번호 일치) —
// 기존 소비처(등록 고객 배지·통합 이력 링크) 동작 유지. name_only(회사명만 일치)는
// 불확실 매치라 company_id에 싣지 않고 match_kind/matched_company_id로만 노출(매칭 패널용).
export async function getApplicationForAdmin(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, profiles:assignee_id(name)")
    .eq("id", id)
    .maybeSingle();
  // DB/RLS 장애가 "찾을 수 없음"으로 위장되지 않게 로깅(이 파일의 다른 함수와 동일 규약).
  if (error) console.error("[applications.getForAdmin]", error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const match = matchCompany(
    {
      company: (row.company as string | null) ?? null,
      biz_no: (row.biz_no as string | null) ?? null,
      company_id: (row.company_id as string | null) ?? null,
    },
    await loadCompanyLites(),
  );
  const effectiveCompanyId =
    match.kind === "linked" || match.kind === "biz_no" ? match.companyId : null;
  return {
    ...row,
    company_id: effectiveCompanyId,
    match_kind: match.kind,
    matched_company_id: match.companyId,
  };
}
