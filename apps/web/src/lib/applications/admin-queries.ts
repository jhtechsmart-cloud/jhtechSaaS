import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/customers/history";
import { buildSearchOr, splitOverflow } from "./admin-search";
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

// 견적 단건(admin 상세) — profiles 조인 + biz_no→companies 매칭(application쪽 JS 정규화).
export async function getApplicationForAdmin(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("applications")
    .select("*, profiles:assignee_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  // companies.biz_no는 upsert RPC가 숫자정규화 저장 → application쪽만 정규화해 단순조회.
  let companyId: string | null = null;
  const digits = ((data.biz_no as string | null) ?? "").replace(/\D/g, "");
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
