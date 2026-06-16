// Railway 워커 진입점 — jobs 큐 폴링(통합 PDF, 향후 메일).
// 잡 트리거 = DB 폴링(FOR UPDATE SKIP LOCKED, claim_next_job). webhook/Realtime 회피.
import { createServiceClient, FakeMailSender, HiworksMailSender, type MailSender } from "@jhtechsaas/shared";
import { loadEnv } from "./env";
import { closeBrowser } from "./jobs/browser";
import { runOnce } from "./jobs/runner";
import { runLoop } from "./loop";

const POLL_MS = 2000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 메일 발송기 — 토큰 있으면 하이웍스(실발송), 없으면 Fake(로컬/미설정 — 실제 발송 안 함).
  const mailSender: MailSender = env.HIWORKS_OFFICE_TOKEN
    ? new HiworksMailSender(env.HIWORKS_OFFICE_TOKEN)
    : new FakeMailSender();
  if (!env.HIWORKS_OFFICE_TOKEN) {
    console.warn("[worker] HIWORKS_OFFICE_TOKEN 미설정 — 메일은 실제 발송되지 않습니다(FakeMailSender)");
  }

  // Railway 재배포·중지 시 SIGTERM — 진행 중 잡을 마치고 크롬 정리 후 종료(잡 고아 방지).
  let stopping = false;
  const requestStop = (signal: string): void => {
    console.log(`[worker] ${signal} 수신 — 진행 중 잡을 마치고 종료합니다`);
    stopping = true;
  };
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  process.on("SIGINT", () => requestStop("SIGINT"));

  console.log("jhtechSaaS worker: jobs 폴링 시작");
  await runLoop({
    runOnce: () => runOnce(supabase, { mailSender }),
    sleep,
    isStopping: () => stopping,
    pollMs: POLL_MS,
    onError: (e) => console.error("[worker] runOnce 에러", e),
  });

  await closeBrowser();
  console.log("[worker] 정상 종료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
