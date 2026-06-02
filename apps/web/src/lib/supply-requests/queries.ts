import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupplyRequestStatus } from "./status";

export { SUPPLY_REQUEST_STATUSES } from "./status";
export type { SupplyRequestStatus } from "./status";

export interface SupplyRequestListRow {
  id: string;
  seq_no: string;
  status: SupplyRequestStatus;
  company_name: string;
  requester_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  item_count: number;
  item_preview: string; // 대표 품목명("필터 외 2건")
  unread: boolean; // admin_read_at NULL
  created_at: string;
}

// 소모품신청 목록 — 최신순. RLS: 자기 배정 건 OR supply_requests.view_all.
export async function listSupplyRequests(): Promise<SupplyRequestListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("supply_requests")
    .select(
      "id,seq_no,status,requester_name,assignee_id,admin_read_at,created_at," +
        "companies:company_id(name),profiles:assignee_id(name)," +
        "supply_request_items(consumable_name_snapshot)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { console.error("[supply_requests.list]", error); return []; }
  // supabase-js 타입파서가 3중 embed(companies·profiles·items)에서 GenericStringError로 bail → 런타임 정상, 캐스팅(equipment/queries.ts 관례).
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => {
    const profiles = r.profiles as { name?: string } | null;
    const company = r.companies as { name?: string } | null;
    const items = (r.supply_request_items as Array<{ consumable_name_snapshot: string }> | null) ?? [];
    const names = items.map((it) => it.consumable_name_snapshot);
    const preview =
      names.length === 0 ? "" : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}건`;
    return {
      id: r.id as string,
      seq_no: r.seq_no as string,
      status: r.status as SupplyRequestStatus,
      company_name: company?.name ?? "-",
      requester_name: r.requester_name as string,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      item_count: items.length,
      item_preview: preview,
      unread: r.admin_read_at == null,
      created_at: r.created_at as string,
    };
  });
}

// 미열람 건수(경량 알림 배지). RLS가 가시 범위를 제한.
export async function countUnreadSupplyRequests(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("supply_requests")
    .select("id", { count: "exact", head: true })
    .is("admin_read_at", null);
  if (error) return 0;
  return count ?? 0;
}

// 소모품신청 단건 — 상세. 회사·담당 + 아이템 라인 조인.
export async function getSupplyRequest(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("supply_requests")
    .select(
      "*, profiles:assignee_id(name), companies:company_id(name,biz_no,ceo,phone)," +
        "supply_request_items(id,consumable_name_snapshot,consumable_unit_snapshot,qty)",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}
