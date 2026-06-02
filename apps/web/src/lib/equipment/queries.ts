import "server-only";
import type { Equipment } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CategoryNode } from "@/lib/equipment/category-tree";

// 장비 전량(최신순). 분류명(category)은 equipment_category 조인으로 채움.
export async function listEquipment(): Promise<Equipment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("*, equipment_category:category_id(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.equipment_category as { name?: string } | null;
    return {
      ...row,
      category_id: (row.category_id as string | null) ?? null,
      category: cat?.name ?? null,
      specs: parseSpecs(row.specs),
    };
  }) as unknown as Equipment[];
}

// 분류 전체 노드(대/소분류). 트리·드롭다운 빌더에 전달.
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_category")
    .select("id,parent_id,name,sort_order")
    .order("sort_order");
  if (error) { console.error("[equipment.categoryTree]", error); return []; }
  return (data ?? []) as CategoryNode[];
}
