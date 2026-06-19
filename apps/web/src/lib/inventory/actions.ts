"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { inventoryInputSchema } from "@/lib/inventory/schema";

export type InventoryActionResult = { error: string } | null;

// 재고 저장 — equipment.manage 가드 + Zod. equipment_id PK라 ON CONFLICT(equipment_id) upsert.
// updated_at/updated_by는 트리거가 서버 강제(클라 입력 안 받음).
// ⚠️ Server Action 직접 POST 대비 가드 재호출. RLS가 최종 강제.
export async function upsertInventoryAction(
  equipmentId: string,
  values: { stockQty: number; restockDate: string | null; note: string | null },
): Promise<InventoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "재고 수정 권한이 없습니다." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };
  const parsed = inventoryInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment_inventory").upsert(
    {
      equipment_id: equipmentId,
      stock_qty: v.stockQty,
      restock_date: v.restockDate,
      note: v.note,
    },
    { onConflict: "equipment_id" },
  );
  if (error) {
    console.error("[inventory.upsert]", error);
    return { error: "재고 저장에 실패했습니다." };
  }
  revalidatePath("/admin/inventory");
  return null;
}
