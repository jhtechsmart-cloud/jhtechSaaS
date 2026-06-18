import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATION_STATUSES,
  ACTIVE_APPLICATION_STATUSES,
  UNPAID_APPLICATION_STATUSES,
} from "@/lib/application-status";
import { SERVICE_REQUEST_STATUSES } from "@/lib/service-requests/status";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";
import { buildUnpaidSummary, type UnpaidAppRow, type UnpaidSummary } from "./unpaid";

// 단일 (table,status) 건수. RLS가 가시 범위 제한(영업=본인+미배정 풀, view_all=전체). 에러는 throw —
// 대시보드는 allSettled로 블록 단위 흡수하므로 여기서 0 폴백 금지(0이 "정상 0"인지 "장애"인지 구분 위해).
async function countByStatus(table: string, statuses: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const entries = await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      if (error) throw new Error(`[dashboard.countByStatus ${table}/${s}] ${error.message}`);
      return [s, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export const countApplicationsByStatus = () =>
  countByStatus("applications", APPLICATION_STATUSES);
export const countServiceByStatus = () =>
  countByStatus("service_requests", SERVICE_REQUEST_STATUSES);
export const countSupplyByStatus = () =>
  countByStatus("supply_requests", SUPPLY_REQUEST_STATUSES);

// 참조 숫자 — 단순 전체 count(RLS 적용). 에러 throw(블록 흡수).
async function countTable(table: string, filter?: { col: string; val: unknown }): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter.col, filter.val);
  const { count, error } = await q;
  if (error) throw new Error(`[dashboard.countTable ${table}] ${error.message}`);
  return count ?? 0;
}

// 미수금 = 납품완료·수금중 의뢰(물건 나갔는데 수금 미완). 대표 발행견적 공급가로 건수·총액·목록.
// RLS가 가시 범위 제한(영업=본인+미배정). 에러는 throw(대시보드 블록 흡수).
export async function unpaidDeliveries(): Promise<UnpaidSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id,seq_no,company,status,profiles:assignee_id(name),quotes(version,status,supply_price,delivery_date)")
    .in("status", UNPAID_APPLICATION_STATUSES as unknown as string[]);
  if (error) throw new Error(`[dashboard.unpaidDeliveries] ${error.message}`);
  const rows: UnpaidAppRow[] = (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const profiles = rec.profiles as { name?: string } | null;
    return {
      id: rec.id as string,
      seq_no: rec.seq_no as string,
      company: rec.company as string,
      status: rec.status as UnpaidAppRow["status"],
      assigneeName: profiles?.name ?? null,
      quotes: ((rec.quotes as UnpaidAppRow["quotes"]) ?? []),
    };
  });
  return buildUnpaidSummary(rows);
}

export const countCustomers = () => countTable("companies");
export const countCompanyEquipment = () => countTable("company_equipment");
export const countActiveEquipment = () => countTable("equipment", { col: "status", val: "active" });

// 담당자별 미완료 부하 — users.manage 전용(이름 RLS). listAssignableStaff(한 자릿수) × 도메인 미완료 count.
// ⚠️ RLS상 viewer가 view_all 없는 도메인은 본인 배정분만 집계됨(프로덕션 admin은 견적만 view_all) → 부분집계.
// 무제한 row pull 금지 → 담당자 목록(소수) 기준으로 도메인별 count head 쿼리.
export async function assigneeLoad(): Promise<{ id: string; name: string; applications: number; service: number; supply: number }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: staff } = await supabase.from("profiles").select("id,name").eq("is_active", true).order("name");
  const rows = staff ?? [];
  const APP_OPEN = ACTIVE_APPLICATION_STATUSES as unknown as string[]; // 진행중(수금완료·종료 제외)
  const REQ_OPEN = ["received", "in_progress", "on_hold"]; // 미완료(done/canceled 제외)
  return Promise.all(
    rows.map(async (s) => {
      const [a, sv, su] = await Promise.all([
        supabase.from("applications").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", APP_OPEN),
        supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", REQ_OPEN),
        supabase.from("supply_requests").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", REQ_OPEN),
      ]);
      return { id: s.id as string, name: (s.name as string) ?? "?", applications: a.count ?? 0, service: sv.count ?? 0, supply: su.count ?? 0 };
    }),
  );
}
