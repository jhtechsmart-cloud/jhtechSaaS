import "server-only";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// equipment_public 뷰 = active만, 가격·옵션 비노출. anon 읽기(세션 없으면 anon role).
const PUBLIC_COLUMNS = "id, name, model, category, photos, specs, youtube_url, created_at";

// 공개 카탈로그 목록(최신순).
export async function listPublicEquipment(): Promise<EquipmentPublic[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_public")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`공개 장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    specs: parseSpecs(row.specs),
  })) as EquipmentPublic[];
}

// 공개 장비 단건. 없거나 inactive면 null(뷰가 active만 노출하므로 자동).
export async function getPublicEquipment(id: string): Promise<EquipmentPublic | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_public")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`공개 장비 조회 실패: ${error.message}`);
  if (!data) return null;
  return { ...data, specs: parseSpecs(data.specs) } as EquipmentPublic;
}
