import "server-only";
import type { Equipment } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 장비 전량 읽기(최신순). RLS: 로그인 스태프 읽기 허용. 페이지네이션 없음(P2 결정).
export async function listEquipment(): Promise<Equipment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    specs: parseSpecs(row.specs),
  })) as Equipment[];
}
