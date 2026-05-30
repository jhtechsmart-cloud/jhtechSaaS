import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// dev 서버를 로컬 Supabase(127.0.0.1)로 강제한다.
// .env.local 은 원격(okxmeqrvtlvmxfltsara.supabase.co)을 가리키므로 덮어써야 한다.
// Next.js는 프로세스 env에 이미 있는 값을 .env* 파일로 덮지 않으므로,
// webServer command에서 직접 주입하면 .env.local보다 우선된다.
//
// 값의 출처: `supabase status -o env` — 로컬 Supabase 표준 데모 키(비밀 아님).
// eval 방식은 sh 버전에 따라 따옴표 이탈 문제가 있어 하드코딩으로 대체.
// 프로젝트별 로컬 Supabase URL/anon 키가 바뀌면 이 값도 갱신해야 한다.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000, // 로그인+폼채우기+업로드 포함 여유있게 60초
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: [
      `NEXT_PUBLIC_SUPABASE_URL=${LOCAL_SUPABASE_URL}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${LOCAL_ANON_KEY}`,
      `pnpm --filter web dev --port ${PORT}`,
    ].join(" "),
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
