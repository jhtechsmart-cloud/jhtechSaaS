import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/customers/history";
import { ACTIVE_APPLICATION_STATUSES, DONE_APPLICATION_STATUSES } from "@/lib/application-status";
import { buildSearchOr, splitOverflow, normalizeBizNo } from "./admin-search";
import { applicationStatusSchema } from "./status-schema";

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
    .select("id,seq_no,status,company,assignee_id,created_at,fields,profiles:assignee_id(name)")
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
  const rows: ApplicationListRow[] = sliced.map((r) => {
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

// 견적 단건(admin 상세) — profiles 조인 + biz_no→companies 매칭(application쪽 JS 정규화).
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

  // companies.biz_no는 upsert RPC가 숫자정규화 저장 → application쪽만 정규화해 단순조회.
  let companyId: string | null = null;
  const digits = normalizeBizNo(data.biz_no as string | null);
  if (digits) {
    const { data: co } = await supabase
      .from("companies")
      .select("id")
      .eq("biz_no", digits)
      .maybeSingle();
    companyId = (co?.id as string | undefined) ?? null;
  }
  return { ...(data as Record<string, unknown>), company_id: companyId };
}
