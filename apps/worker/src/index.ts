// Railway 워커 진입점 — jobs 큐 폴링(통합 PDF, 향후 메일).
// 잡 트리거 = DB 폴링(FOR UPDATE SKIP LOCKED, claim_next_job). webhook/Realtime 회피.
import { createServiceClient } from "@jhtechsaas/shared";
import { loadEnv } from "./env";
import { runOnce } from "./jobs/runner";

const POLL_MS = 2000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("jhtechSaaS worker: jobs 폴링 시작");
  for (;;) {
    let worked = false;
    try {
      worked = await runOnce(supabase);
    } catch (e) {
      console.error("[worker] runOnce 에러", e);
    }
    // 처리할 잡이 없으면 잠깐 쉬고, 있으면 바로 다음 잡(버스트 소진).
    if (!worked) await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
