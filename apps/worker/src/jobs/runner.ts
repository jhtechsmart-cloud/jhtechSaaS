import type { SupabaseClient } from "@supabase/supabase-js";
import { claimNextJob, completeJob, failJob } from "./queue";
import { processQuotePdfJob } from "./quote-pdf";

// 잡 1건 처리 — claim → 타입별 process → complete/fail. 처리할 잡이 있었으면 true.
// 폴링 루프(index.ts)와 테스트가 공유.
export async function runOnce(supabase: SupabaseClient): Promise<boolean> {
  const job = await claimNextJob(supabase);
  if (!job) return false;
  try {
    switch (job.type) {
      case "quote_pdf":
        await processQuotePdfJob(supabase, job.payload);
        break;
      default:
        throw new Error(`알 수 없는 잡 타입: ${job.type}`);
    }
    await completeJob(supabase, job.id);
  } catch (e) {
    // failJob 자체가 실패(throw)해도 원래 실패 원인이 소실되지 않게 선기록.
    console.error(`[worker] 잡 처리 실패 id=${job.id} type=${job.type}`, e);
    await failJob(supabase, job, e instanceof Error ? e.message : String(e));
  }
  return true;
}
