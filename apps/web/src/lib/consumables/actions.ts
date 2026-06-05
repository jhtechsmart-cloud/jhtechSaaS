"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { consumableFormSchema, type ConsumableFormValues } from "@/lib/consumables/schema";
import { diffScopes } from "@/lib/consumables/scope-diff";

export type ConsumableActionResult = { error: string } | null;

// scope diff-upsert — 삭제→업데이트→신규 순. diff 순수 로직은 scope-diff.ts.
// RLS는 consumables.manage만 검사 → row 소유(consumable_id 스코프)는 앱에서 강제.
async function applyScopeDiff(
  supabase: SupabaseClient,
  consumableId: string,
  values: ConsumableFormValues,
): Promise<string | null> {
  const { data: existingRows, error: exErr } = await supabase
    .from("consumable_scope").select("id").eq("consumable_id", consumableId);
  if (exErr) return exErr.message;
  const { toDelete, toUpdate, toInsert } = diffScopes(
    consumableId,
    (existingRows ?? []).map((r: { id: string }) => r.id),
    values.scopes,
  );
  if (toDelete.length) {
    const { error } = await supabase.from("consumable_scope").delete().in("id", toDelete);
    if (error) return error.message;
  }
  // 제출된 id 중 이 소모품 소속 행만 업데이트(cross-consumable 행 조작 방지).
  // RLS는 consumables.manage만 검사하고 row 소유는 안 보므로 consumable_id 스코프를 앱에서 강제.
  const ownedIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    if (!ownedIds.has(id)) continue; // 위조·타 소모품 id는 무시
    const { error } = await supabase
      .from("consumable_scope").update(rest).eq("id", id).eq("consumable_id", consumableId);
    if (error) return error.message;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("consumable_scope").insert(toInsert);
    if (error) return error.message;
  }
  return null;
}

// 소모품 row 변환 — 빈 문자열은 null, price는 숫자 또는 null.
function consumableRow(v: ConsumableFormValues) {
  return {
    name: v.name,
    unit: v.unit || null,
    sku: v.sku || null,
    price: v.price === "" ? null : Number(v.price),
    note: v.note || null,
    status: v.status,
  };
}

// 소모품 신규 등록. id는 클라에서 생성한 UUID. scope 저장 실패 시 보상 삭제.
export async function createConsumable(id: string, values: ConsumableFormValues): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = consumableFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("consumables").insert({ id, ...consumableRow(v) });
  if (error) { console.error("[consumables.create] insert 실패", error); return { error: "저장하지 못했습니다." }; }
  const scopeErr = await applyScopeDiff(supabase, id, v);
  if (scopeErr) {
    // 보상 삭제: scope 저장 실패 시 방금 생성한 소모품 row 제거(고아 방지 + 동일 id 재시도 가능).
    console.error("[consumables.create] scope 저장 실패, 보상 삭제", scopeErr);
    await supabase.from("consumables").delete().eq("id", id);
    return { error: "매핑을 저장하지 못했습니다." };
  }
  revalidatePath("/admin/consumables");
  redirect(`/admin/consumables/${id}/edit`);
}

// 소모품 정보 수정. 0행 업데이트 = 동시 삭제 감지.
export async function updateConsumable(id: string, values: ConsumableFormValues): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = consumableFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("consumables").update(consumableRow(v)).eq("id", id).select("id");
  if (error) { console.error("[consumables.update] update 실패", error); return { error: "저장하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  const scopeErr = await applyScopeDiff(supabase, id, v);
  if (scopeErr) { console.error("[consumables.update] scope 저장 실패", scopeErr); return { error: "매핑을 저장하지 못했습니다." }; }
  revalidatePath("/admin/consumables");
  redirect("/admin/consumables");
}

// 소모품 삭제. consumable_scope는 FK cascade로 자동 삭제.
export async function deleteConsumable(id: string): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("consumables").delete().eq("id", id).select("id");
  if (error) { console.error("[consumables.delete] delete 실패", error); return { error: "삭제하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  revalidatePath("/admin/consumables");
  redirect("/admin/consumables");
}
