import "server-only";
import { parseSpecs, type SpecGroup } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchableEquipment } from "./equipment-match";

export type EquipmentOption = { kind: "included" | "extra"; name: string; price: string };
export type MatchableEquipmentWithOptions = MatchableEquipment & {
  options: EquipmentOption[];
  specs: SpecGroup[];
};

// 활성 장비 + 옵션 + 카테고리명. 매칭 후보 풀(운영 장비 소수라 전량 로드 OK).
export async function listEquipmentForMatch(): Promise<MatchableEquipmentWithOptions[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, model, base_price, photos, specs, equipment_category:category_id(name), equipment_option(kind, name, price)")
    .eq("status", "active");
  if (error) {
    console.error("[equipment-match] 장비 조회 실패", error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.equipment_category as { name?: string } | null;
    const opts = (row.equipment_option as Array<Record<string, unknown>> | null) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      model: (row.model as string | null) ?? null,
      category: cat?.name ?? null,
      photos: (row.photos as string[] | null) ?? [],
      basePrice: Number(row.base_price ?? 0),
      specs: parseSpecs(row.specs),
      options: opts.map((o) => ({
        kind: o.kind as "included" | "extra",
        name: o.name as string,
        price: String(o.price ?? "0"),
      })),
    };
  });
}
