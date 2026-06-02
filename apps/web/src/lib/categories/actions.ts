"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";

export type CategoryActionResult = { error: string } | null;

// 분류 이름 검증 스키마
const nameSchema = z.string().trim().min(1, "이름을 입력하세요").max(100, "100자 이내");

// 대분류 또는 소분류 추가. parentId 없으면 대분류, 있으면 소분류.
export async function createCategory(
  name: string,
  parentId: string | null,
): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parentId !== null && !z.string().uuid().safeParse(parentId).success) {
    return { error: "잘못된 상위 분류입니다." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("equipment_category")
    .insert({ name: parsed.data, parent_id: parentId });

  if (error) {
    if (error.code === "23505") return { error: "이미 같은 이름의 분류가 있습니다." };
    console.error("[categories.create]", error);
    return { error: "분류를 추가하지 못했습니다." };
  }

  revalidatePath("/admin/categories");
  return null;
}

// 이름 변경.
export async function renameCategory(
  id: string,
  name: string,
): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_category")
    .update({ name: parsed.data })
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23505") return { error: "이미 같은 이름의 분류가 있습니다." };
    console.error("[categories.rename]", error);
    return { error: "이름을 변경하지 못했습니다." };
  }

  if (!data || data.length === 0) return { error: "없는 분류입니다." };

  revalidatePath("/admin/categories");
  return null;
}

// 삭제. 참조(자식·장비·소모품 scope) 있으면 FK restrict로 거부 → 안내.
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_category")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "이 분류를 쓰는 하위분류·장비·소모품이 있어 삭제할 수 없습니다. 먼저 재배정하세요.",
      };
    }
    console.error("[categories.delete]", error);
    return { error: "삭제하지 못했습니다." };
  }

  if (!data || data.length === 0) return { error: "없는 분류입니다." };

  revalidatePath("/admin/categories");
  return null;
}
