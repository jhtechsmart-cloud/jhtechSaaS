import "server-only";
// 발행 출고의뢰서의 의뢰별 최신 설치일시 = 대시보드/캘린더/미수금 '납품 일정' 단일 출처.
// 단일테넌트 소규모라 발행본 전수 조회 후 JS 집계(범위 필터는 호출자가 dateKst로). RLS가 가시 범위 강제.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pickLatestDeliveries, type DeliveryRow } from "./deliveries-logic";

export type { DeliveryRow };

export async function loadLatestDeliveries(): Promise<DeliveryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("release_orders")
    .select("id, application_id, version, install_at, applications:application_id(company)")
    .eq("status", "issued");
  if (error) throw new Error(`[release-orders.deliveries] ${error.message}`);
  return pickLatestDeliveries(
    (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const app = r.applications as { company?: string } | null;
      return {
        releaseOrderId: r.id as string,
        applicationId: r.application_id as string,
        version: (r.version as number) ?? 0,
        installAt: (r.install_at as string | null) ?? null,
        company: app?.company ?? null,
      };
    }),
  );
}
