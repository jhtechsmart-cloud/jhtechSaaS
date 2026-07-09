import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 재고현황 행 — 활성 장비 + 재고(있으면). 재고행 없는 장비는 수량 0/미설정으로 표시.
export interface InventoryRow {
  equipmentId: string;
  name: string;
  model: string | null;
  category: string | null; // 분류명(그룹 헤더용)
  stockQty: number;
  soldConfirmed: number; // 판매확정(대수, 읽기전용)
  demoQty: number; // 데모장비(대수, 수기)
  usedQty: number; // 중고장비(대수, 수기)
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
        "equipment_inventory(stock_qty, sold_confirmed, demo_qty, used_qty, restock_date, note, updated_at, profiles:updated_by(name))",
    )
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(`재고 목록 조회 실패: ${error.message}`);

  // 중첩 임베드 select는 supabase-js 타입 추론이 error 유니온으로 떨어진다(listEquipment와 동일 한계).
  // 런타임 형태는 알고 있으므로 Record로 좁힌다.
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const cat = row.equipment_category as { name?: string } | null;
    // equipment_inventory는 equipment_id가 PK이자 FK → PostgREST가 1:1로 감지해 객체로 반환할 수도,
    // 역참조로 배열로 반환할 수도 있다. 둘 다 안전 처리.
    type Inv = { stock_qty: number; sold_confirmed: number; demo_qty: number; used_qty: number; restock_date: string | null; note: string | null; updated_at: string | null; profiles: { name?: string } | null };
    const invRaw = row.equipment_inventory as Inv | Inv[] | null;
    const inv: Inv | null = Array.isArray(invRaw) ? (invRaw[0] ?? null) : invRaw;
    return {
      equipmentId: row.id as string,
      name: row.name as string,
      model: (row.model as string | null) ?? null,
      category: cat?.name ?? null,
      stockQty: inv?.stock_qty ?? 0,
      soldConfirmed: inv?.sold_confirmed ?? 0,
      demoQty: inv?.demo_qty ?? 0,
      usedQty: inv?.used_qty ?? 0,
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

// 판매확정/취소 로그 1건(모달 표시용).
export interface SaleLogEntry {
  id: string;
  action: "confirm" | "cancel";
  actorName: string | null;
  createdAt: string;
}

// 특정 장비의 판매확정 로그 — 최근 2개월만, 최신순. 모달 열 때 조회.
export async function listSaleLog(equipmentId: string): Promise<SaleLogEntry[]> {
  const supabase = await createSupabaseServerClient();
  const since = new Date();
  since.setMonth(since.getMonth() - 2); // 오늘 기준 2개월 전
  const { data, error } = await supabase
    .from("inventory_sale_log")
    .select("id, action, created_at, profiles:actor_id(name)")
    .eq("equipment_id", equipmentId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`판매확정 로그 조회 실패: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    action: r.action as "confirm" | "cancel",
    actorName: (r.profiles as { name?: string } | null)?.name ?? null,
    createdAt: r.created_at as string,
  }));
}
