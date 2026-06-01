"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serializeSpecs } from "@jhtechsaas/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { equipmentFormSchema, type EquipmentFormValues } from "@/lib/equipment/schema";
import { serializeOptions } from "@/lib/equipment/options";

export type EquipmentActionResult = { error: string } | null;

// 옵션 = replace 전략(전량 삭제 후 재삽입). 단일 관리자 admin 흐름이라 충분.
async function replaceOptions(
  supabase: SupabaseClient,
  equipmentId: string,
  values: EquipmentFormValues,
): Promise<string | null> {
  const { error: delErr } = await supabase
    .from("equipment_option")
    .delete()
    .eq("equipment_id", equipmentId);
  if (delErr) return delErr.message;

  const rows = serializeOptions(values.options).map((o) => ({
    equipment_id: equipmentId,
    kind: o.kind,
    name: o.name,
    price: o.price,
  }));
  if (rows.length === 0) return null;
  const { error: insErr } = await supabase.from("equipment_option").insert(rows);
  return insErr ? insErr.message : null;
}

export async function createEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "잘못된 요청입니다." };
  }

  const parsed = equipmentFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment").insert({
    id,
    name: v.name,
    model: v.model || null,
    category: v.category || null,
    base_price: v.base_price,
    status: v.status,
    // 빈 불릿·빈 URL은 저장 단계에서 제거(공개면 phantom 빈 줄/빈 영상섹션 방지).
    highlights: v.highlights.map((h) => h.trim()).filter(Boolean),
    youtube_urls: v.youtube_urls.map((u) => u.trim()).filter(Boolean),
    specs: serializeSpecs(v.specs),
    photos: v.photos,
  });
  // 원시 DB 메시지는 스키마 fingerprinting 노출이라 서버 로그로만 남기고 일반 메시지 반환.
  if (error) {
    console.error("[equipment.create] insert 실패", error);
    return { error: "저장하지 못했습니다." };
  }

  const optErr = await replaceOptions(supabase, id, v);
  if (optErr) {
    // 보상 삭제: 옵션 저장 실패 시 방금 만든 장비 row 제거.
    // 고아 row 방지 + 동일 id 재시도가 duplicate-key로 막히지 않게 함(F1).
    console.error("[equipment.create] 옵션 저장 실패, 장비 row 보상 삭제", optErr);
    await supabase.from("equipment").delete().eq("id", id);
    return { error: "옵션을 저장하지 못했습니다." };
  }

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

export async function updateEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  // create와 동일하게 id를 검증(직접 POST의 잘못된 id로 DB 캐스트 에러 노출 방지).
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "잘못된 요청입니다." };
  }

  const parsed = equipmentFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  // delete와 동일하게 select로 0행 갱신 감지(동시 삭제·없는 id로 무음 성공 방지).
  const { data, error } = await supabase
    .from("equipment")
    .update({
      name: v.name,
      model: v.model || null,
      category: v.category || null,
      base_price: v.base_price,
      status: v.status,
      // 빈 불릿·빈 URL은 저장 단계에서 제거(공개면 phantom 빈 줄/빈 영상섹션 방지).
      highlights: v.highlights.map((h) => h.trim()).filter(Boolean),
      youtube_urls: v.youtube_urls.map((u) => u.trim()).filter(Boolean),
      specs: serializeSpecs(v.specs),
      photos: v.photos,
    })
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[equipment.update] update 실패", error);
    return { error: "저장하지 못했습니다." };
  }
  if (!data || data.length === 0) {
    return { error: "이미 삭제되었거나 없는 항목입니다." };
  }

  const optErr = await replaceOptions(supabase, id, v);
  if (optErr) {
    console.error("[equipment.update] 옵션 저장 실패", optErr);
    return { error: "옵션을 저장하지 못했습니다." };
  }

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

export async function deleteEquipment(id: string): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "잘못된 요청입니다." };
  }

  const supabase = await createSupabaseServerClient();
  // 0행 삭제 감지를 위해 select 반환(이월 ③). equipment_option은 FK cascade.
  const { data, error } = await supabase
    .from("equipment")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("[equipment.delete] delete 실패", error);
    return { error: "삭제하지 못했습니다." };
  }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };

  // Storage 폴더 best-effort 정리(고아 방지). 실패는 무시.
  const { data: files } = await supabase.storage
    .from("equipment-images")
    .list(`equipment/${id}`);
  if (files && files.length > 0) {
    await supabase.storage
      .from("equipment-images")
      .remove(files.map((f) => `equipment/${id}/${f.name}`))
      .catch(() => {});
  }

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}
