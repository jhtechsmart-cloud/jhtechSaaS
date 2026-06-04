import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES } from "@/lib/application-status";
import { SERVICE_REQUEST_STATUSES } from "@/lib/service-requests/status";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";

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

export const countCustomers = () => countTable("companies");
export const countCompanyEquipment = () => countTable("company_equipment");
export const countActiveEquipment = () => countTable("equipment", { col: "status", val: "active" });
