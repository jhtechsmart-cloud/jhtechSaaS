"use server";
// 홈페이지(워드프레스) 연동 패널의 서버 액션(#253) — 상태 스냅샷 조회(폴링) + 버튼 enqueue.
// 권한·상태 검증은 SECURITY DEFINER RPC(enqueue_wp_publish)가 서버에서 강제한다.
import { z } from "zod";
import { deriveWpStatus, resolveWpCategoryId, type WpStatus } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";

export interface WpSnapshot {
  status: WpStatus;
  postId: number | null;
  postStatus: "draft" | "publish" | null;
  syncedAt: string | null;
  enabled: boolean;
}

// 패널 상태 스냅샷 — 잡 진행 폴링과 초기 렌더가 공유. 로그인 스태프 전원 조회 가능(쓰기 아님).
export async function getWpSnapshot(equipmentId: string): Promise<WpSnapshot | { error: string }> {
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();

  const [{ data: eq, error }, { data: jobState }, { data: cats }] = await Promise.all([
    supabase
      .from("equipment")
      .select("wp_publish_enabled, wp_post_id, wp_post_status, wp_dirty, wp_last_error, wp_synced_at, category_id")
      .eq("id", equipmentId)
      .maybeSingle(),
    supabase.rpc("get_wp_job_state", { p_equipment_id: equipmentId }),
    supabase.from("equipment_category").select("id,parent_id,wp_category_id"),
  ]);
  if (error || !eq) return { error: "장비를 찾을 수 없습니다." };

  const mappingResolved =
    resolveWpCategoryId(eq.category_id as string | null, (cats ?? []) as never) != null;
  const activeJob = jobState === "queued" || jobState === "processing" ? jobState : null;

  return {
    status: deriveWpStatus({
      wpPublishEnabled: Boolean(eq.wp_publish_enabled),
      wpPostId: (eq.wp_post_id as number | null) ?? null,
      wpPostStatus: (eq.wp_post_status as "draft" | "publish" | null) ?? null,
      wpDirty: Boolean(eq.wp_dirty),
      wpLastError: (eq.wp_last_error as string | null) ?? null,
      mappingResolved,
      activeJob,
    }),
    postId: (eq.wp_post_id as number | null) ?? null,
    postStatus: (eq.wp_post_status as "draft" | "publish" | null) ?? null,
    syncedAt: (eq.wp_synced_at as string | null) ?? null,
    enabled: Boolean(eq.wp_publish_enabled),
  };
}

// 버튼 enqueue — publish(발행)/refresh(공개 글 갱신)/sync(초안 재동기화·재시도)/
// force_sync(#262 수동 편집 감지 무시 덮어쓰기 — RPC가 users.manage를 추가 강제).
export async function enqueueWpAction(
  equipmentId: string,
  action: "publish" | "refresh" | "sync" | "force_sync",
): Promise<{ error: string } | null> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(equipmentId).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("enqueue_wp_publish", {
    p_equipment_id: equipmentId,
    p_action: action,
  });
  if (error) {
    // RPC의 raise exception 메시지는 사용자 안내문(한국어) — 그대로 전달.
    return { error: error.message };
  }
  return null;
}
