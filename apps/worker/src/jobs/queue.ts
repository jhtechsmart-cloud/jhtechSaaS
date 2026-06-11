import type { SupabaseClient } from "@supabase/supabase-js";

// jobs 큐 클라이언트 — 워커(service_role)가 claim/complete/fail. claim은 SKIP LOCKED RPC.
export type Job = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  status: string;
};

const MAX_ATTEMPTS = 3;

export async function claimNextJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_next_job");
  if (error) throw new Error(`잡 claim 실패: ${error.message}`);
  return (data as Job | null) ?? null;
}

export async function completeJob(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`잡 완료 기록 실패: ${error.message}`);
}

// 실패 — 시도 횟수가 한도 미만이면 재시도(queued)로 되돌리고, 한도 도달이면 failed.
// 기록 update의 에러를 삼키면 잡이 processing으로 고착되므로 completeJob과 동일하게 throw.
export async function failJob(supabase: SupabaseClient, job: Job, message: string): Promise<void> {
  const status = job.attempts >= MAX_ATTEMPTS ? "failed" : "queued";
  const { error } = await supabase
    .from("jobs")
    .update({ status, last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw new Error(`잡 실패 기록 실패: ${error.message}`);
}
