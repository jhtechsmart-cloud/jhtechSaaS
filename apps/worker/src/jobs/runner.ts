import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailSender, WpPublisher } from "@jhtechsaas/shared";
import { claimNextJob, completeJob, failJob, touchJob } from "./queue";
import { processQuotePdfJob } from "./quote-pdf";
import { processReleasePdfJob } from "./release-pdf";
import { processEmailJob } from "./email";
import { processServiceReportPdfJob } from "./service-report-pdf";
import { processServiceReportEmailJob } from "./service-report-email";
import { processWpPublishJob } from "./wp-publish";

// 워커 의존 주입(잡 타입별 외부 자원). 메일 발송기·WP 발행기는 index.ts가 env 기반으로 주입.
export type RunDeps = { mailSender?: MailSender; wpPublisher?: WpPublisher };

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
      case "release_pdf":
        await processReleasePdfJob(supabase, job.payload);
        break;
      case "email":
        if (!deps.mailSender) throw new Error("MailSender 미주입 — 워커 메일 설정 누락");
        await processEmailJob(supabase, job.payload, deps.mailSender, job.attempts);
        break;
      case "service_report_pdf":
        await processServiceReportPdfJob(supabase, job.payload);
        break;
      case "service_report_email":
        if (!deps.mailSender) throw new Error("MailSender 미주입 — 워커 메일 설정 누락");
        await processServiceReportEmailJob(supabase, job.payload, deps.mailSender, job.attempts);
        break;
      case "wp_publish":
        if (!deps.wpPublisher) throw new Error("WpPublisher 미주입 — 워커 WP 설정 누락");
        await processWpPublishJob(supabase, job.payload, deps.wpPublisher, {
          touch: () => touchJob(supabase, job.id), // 미디어 업로드마다 하트비트(5분 스테일 회수 회피)
        });
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
