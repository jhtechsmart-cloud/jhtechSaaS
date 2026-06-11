import type { SupabaseClient } from "@supabase/supabase-js";

// jobs 큐 클라이언트 — 워커(service_role)가 claim/complete/fail. claim은 SKIP LOCKED RPC.
export type Job = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  status: string;
};

// ⚠️ claim_next_job 마이그레이션(20260611120000)의 `attempts < 3` 가드와 반드시 동기.
// 한쪽만 바꾸면 스테일 회수·failed 확정 경계가 어긋난다(SQL/TS 공유 불가라 주석으로 고정).
export const MAX_ATTEMPTS = 3;

export async function claimNextJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_next_job");
  if (error) throw new Error(`잡 claim 실패: ${error.message}`);
  return (data as Job | null) ?? null;
}

export async function completeJob(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "processing") // 펜스 — 배포 중첩·스테일 회수 레이스로 done/failed를 되돌리지 않게
    .select("id");
  if (error) throw new Error(`잡 완료 기록 실패: ${error.message}`);
  if (!data || data.length === 0)
    console.warn(`[worker] 잡 완료 기록 0행 — 이미 다른 워커가 처리한 잡일 수 있음 id=${id}`);
}

// 실패 — 시도 횟수가 한도 미만이면 재시도(queued)로 되돌리고, 한도 도달이면 failed.
// 기록 update의 에러를 삼키면 잡이 processing으로 고착되므로 completeJob과 동일하게 throw.
export async function failJob(supabase: SupabaseClient, job: Job, message: string): Promise<void> {
  const status = job.attempts >= MAX_ATTEMPTS ? "failed" : "queued";
  const { data, error } = await supabase
    .from("jobs")
    .update({ status, last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "processing") // 펜스 — 다른 워커가 이미 완료한 잡을 queued/failed로 되돌리지 않게
    .select("id");
  if (error) throw new Error(`잡 실패 기록 실패: ${error.message}`);
  if (!data || data.length === 0)
    console.warn(`[worker] 잡 실패 기록 0행 — 이미 다른 워커가 처리한 잡일 수 있음 id=${job.id}`);
}
