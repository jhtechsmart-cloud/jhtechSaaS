import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 재고현황 행 — 활성 장비 + 재고(있으면). 재고행 없는 장비는 수량 0/미설정으로 표시.
export interface InventoryRow {
  equipmentId: string;
  name: string;
  model: string | null;
  category: string | null; // 분류명(그룹 헤더용)
  stockQty: number;
  restockDate: string | null;
  note: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

// 활성 장비 전체를 재고와 함께 조회(LEFT 임베드). 분류명·이름 정렬.
export async function listInventory(): Promise<InventoryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select(
      "id, name, model, equipment_category:category_id(name), " +
        "equipment_inventory(stock_qty, restock_date, note, updated_at, profiles:updated_by(name))",
    )
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(`재고 목록 조회 실패: ${error.message}`);

  // 중첩 임베드 select는 supabase-js 타입 추론이 error 유니온으로 떨어진다(listEquipment와 동일 한계).
  // 런타임 형태는 알고 있으므로 Record로 좁힌다.
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const cat = row.equipment_category as { name?: string } | null;
    // equipment_inventory는 1:1이지만 PostgREST 역참조라 배열 → 첫 행.
    const invArr = row.equipment_inventory as
      | { stock_qty: number; restock_date: string | null; note: string | null; updated_at: string | null; profiles: { name?: string } | null }[]
      | null;
    const inv = Array.isArray(invArr) ? invArr[0] : null;
    return {
      equipmentId: row.id as string,
      name: row.name as string,
      model: (row.model as string | null) ?? null,
      category: cat?.name ?? null,
      stockQty: inv?.stock_qty ?? 0,
      restockDate: inv?.restock_date ?? null,
      note: inv?.note ?? null,
      updatedAt: inv?.updated_at ?? null,
      updatedByName: inv?.profiles?.name ?? null,
    } satisfies InventoryRow;
  });

  // 분류명(없으면 뒤) → 장비명 정렬.
  return rows.sort((a, b) => {
    const ca = a.category ?? "￿";
    const cb = b.category ?? "￿";
    if (ca !== cb) return ca.localeCompare(cb, "ko");
    return a.name.localeCompare(b.name, "ko");
  });
}
