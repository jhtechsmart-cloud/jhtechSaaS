import "server-only";
// #243 장비 상세 AS 이력 — 모델 단위 조회.
// ⚠️ 단일 원본 = service_reports.catalog_equipment_id 직접 조회(전용 인덱스).
//    company_equipment 조인 금지 — 영업(view) RLS 스코프에 걸려 타 담당 고객 이력이 조용히 누락된다.
// ⚠️ status는 RLS만 믿지 않고 앱에서 명시 — view_all·admin 계정의 draft 혼입 방어.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EquipmentReportRow } from "@/lib/equipment/history-filters";

// 300건 절단 = "최근 300건 표본" 계약(#244) — 도달 시 화면에 배지·통계 카드에 표기.
export const HISTORY_LIMIT = 300;

export async function listEquipmentReports(
  equipmentId: string,
): Promise<{ ok: true; data: EquipmentReportRow[] } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_reports")
    .select(
      "id, seq_no, status, customer_name, device_serial, faults, action_text, parts, charge_type, total, pdf_url, void_reason, issued_at, company_equipment_id, free_reason",
    )
    .eq("catalog_equipment_id", equipmentId)
    .in("status", ["issued", "voided"])
    // nullsFirst:false — null issued_at 행이 300 슬롯 맨 앞을 차지해 최신 행을 밀어내지 않게(#244).
    .order("issued_at", { ascending: false, nullsFirst: false })
    .limit(HISTORY_LIMIT);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as EquipmentReportRow[] };
}

// 미연결 보유장비 건수 — SECURITY DEFINER RPC(뷰어 무관 정확 건수, match 규칙 1벌 재사용).
// 실패는 안내 미표시로 강등(이력 자체를 막지 않는다).
export async function countUnlinkedForEquipment(equipmentId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("count_unlinked_company_equipment", {
    p_equipment_id: equipmentId,
  });
  if (error) {
    console.error("[equipment-history.unlinked]", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
