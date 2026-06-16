import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailSender } from "@jhtechsaas/shared";
import { claimNextJob, completeJob, failJob } from "./queue";
import { processQuotePdfJob } from "./quote-pdf";
import { processEmailJob } from "./email";

// 워커 의존 주입(잡 타입별 외부 자원). 메일 발송기는 index.ts가 env 기반으로 주입.
export type RunDeps = { mailSender?: MailSender };

// 잡 1건 처리 — claim → 타입별 process → complete/fail. 처리할 잡이 있었으면 true.
// 폴링 루프(index.ts)와 테스트가 공유.
export async function runOnce(supabase: SupabaseClient, deps: RunDeps = {}): Promise<boolean> {
  const job = await claimNextJob(supabase);
  if (!job) return false;
  try {
    switch (job.type) {
      case "quote_pdf":
        await processQuotePdfJob(supabase, job.payload);
        break;
      case "email":
        if (!deps.mailSender) throw new Error("MailSender 미주입 — 워커 메일 설정 누락");
        await processEmailJob(supabase, job.payload, deps.mailSender);
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
