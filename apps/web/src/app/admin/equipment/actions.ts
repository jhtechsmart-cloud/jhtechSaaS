"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { equipmentFormSchema, type EquipmentFormValues } from "@/lib/equipment/schema";

export type EquipmentActionResult = { error: string } | null;

export async function createEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

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
    youtube_url: v.youtube_url || null,
    specs: [],
    photos: [],
  });
  if (error) return { error: `저장하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

export async function updateEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const parsed = equipmentFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name: v.name,
      model: v.model || null,
      category: v.category || null,
      base_price: v.base_price,
      status: v.status,
      youtube_url: v.youtube_url || null,
    })
    .eq("id", id);
  if (error) return { error: `저장하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

export async function deleteEquipment(id: string): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return { error: `삭제하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}
