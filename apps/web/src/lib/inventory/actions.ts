"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage, requireAnyConsoleCapability } from "@/lib/auth/guard";
import { inventoryInputSchema } from "@/lib/inventory/schema";
import { listSaleLog, type SaleLogEntry } from "@/lib/inventory/queries";

export type InventoryActionResult = { error: string } | null;

// 재고 저장 — equipment.manage 가드 + Zod. equipment_id PK라 ON CONFLICT(equipment_id) upsert.
// 재고수량·데모·중고·입고예정일·메모를 저장(판매확정은 여기서 안 건드림 — 읽기전용).
// updated_at/updated_by는 트리거가 서버 강제(클라 입력 안 받음).
// ⚠️ Server Action 직접 POST 대비 가드 재호출. RLS가 최종 강제.
export async function upsertInventoryAction(
  equipmentId: string,
  values: {
    stockQty: number;
    demoQty: number;
    usedQty: number;
    restockDate: string | null;
    note: string | null;
  },
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
      demo_qty: v.demoQty,
      used_qty: v.usedQty,
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

// 메모만 저장(모달 전용) — equipment.manage. 다른 컬럼은 건드리지 않음(onConflict 시 note만 SET).
export async function updateInventoryNoteAction(
  equipmentId: string,
  note: string | null,
): Promise<InventoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "재고 수정 권한이 없습니다." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };
  const trimmed = note && note.trim() !== "" ? note.trim() : null;
  if (trimmed && trimmed.length > 500) return { error: "메모는 500자 이내여야 합니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("equipment_inventory")
    .upsert({ equipment_id: equipmentId, note: trimmed }, { onConflict: "equipment_id" });
  if (error) {
    console.error("[inventory.updateNote]", error);
    return { error: "메모 저장에 실패했습니다." };
  }
  revalidatePath("/admin/inventory");
  return null;
}

// 판매확정 — 모든 콘솔 사용자. RPC가 재고>0 검사·재고-1/판매확정+1·로그 기록·권한 최종 강제.
export async function confirmSaleAction(equipmentId: string): Promise<InventoryActionResult> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_equipment_sale", { p_equipment_id: equipmentId });
  if (error) {
    // RPC가 던지는 '재고가 없습니다' 등 사용자 메시지는 그대로 노출.
    const msg = error.message.includes("재고가 없습니다") ? "재고가 없습니다." : "판매확정에 실패했습니다.";
    return { error: msg };
  }
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/view");
  return null;
}

// 판매확정 취소 — 관리자만. RPC가 판매확정>0 검사·판매확정-1/재고+1·로그 기록.
export async function cancelSaleAction(equipmentId: string): Promise<InventoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "취소 권한이 없습니다(관리자 전용)." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_equipment_sale", { p_equipment_id: equipmentId });
  if (error) {
    const msg = error.message.includes("취소할 판매확정이 없습니다")
      ? "취소할 판매확정이 없습니다."
      : "판매확정 취소에 실패했습니다.";
    return { error: msg };
  }
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/view");
  return null;
}

// 판매확정 로그 조회(모달) — 콘솔 사용자 전원. 최근 2개월.
export async function listSaleLogAction(
  equipmentId: string,
): Promise<{ error: string } | { entries: SaleLogEntry[] }> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };
  try {
    const entries = await listSaleLog(equipmentId);
    return { entries };
  } catch {
    return { error: "로그 조회에 실패했습니다." };
  }
}
