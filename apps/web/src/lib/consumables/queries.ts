import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 목록 행 — 소모품 + 매핑 요약.
export interface ConsumableListRow {
  id: string;
  name: string;
  unit: string | null;
  sku: string | null;
  status: "active" | "inactive";
  scope_count: number;
  scope_summary: string; // "UV프린터 외 2건" / "-"
  updated_at: string;
}

// 소모품 목록 — 최신순. RLS: consumables.manage 보유자만 접근.
// consumable_scope 임베드(category_id → equipment_category.name + equipment.name)로 범위 요약 구성.
export async function listConsumables(): Promise<ConsumableListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consumables")
    .select("id,name,unit,sku,status,updated_at,consumable_scope(category_id,equipment_id,equipment_category:category_id(name),equipment:equipment_id(name))")
    .order("updated_at", { ascending: false });
  if (error) { console.error("[consumables.list]", error); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => {
    // category_id 기반: equipment_category.name(분류 노드명) 또는 equipment.name(직접 장비명) 중 존재하는 것 사용
    const scopes = (r.consumable_scope as Array<{ equipment_category: { name?: string } | null; equipment: { name?: string } | null }> | null) ?? [];
    const labels = scopes
      .map((s) => s.equipment_category?.name ?? s.equipment?.name ?? null)
      .filter((x): x is string => !!x);
    const scope_summary =
      labels.length === 0 ? "-" : labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}건`;
    return {
      id: r.id as string,
      name: r.name as string,
      unit: r.unit as string | null,
      sku: r.sku as string | null,
      status: r.status as "active" | "inactive",
      scope_count: labels.length,
      scope_summary,
      updated_at: r.updated_at as string,
    };
  });
}

// 소모품 단건 — 매핑 포함. 수정 폼에서 사용.
export async function getConsumable(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("consumables")
    .select("*, consumable_scope(*)")
    .eq("id", id)
    .single();
  return data;
}
