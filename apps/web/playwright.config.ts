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
// service_role(로컬 데모, 비밀 아님) — /admin/users 계정 생성 등 런타임 auth.admin 호출에 필요.
// .env.local의 service_role 키는 프로덕션용이라 로컬 URL과 불일치 → 여기서 로컬 키로 덮어쓴다.
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // dev 서버(Next on-demand 컴파일)에 풀스위트 누적 부하가 걸리면 일부 목록 클릭이
  // 단발성 타임아웃을 낸다(격리·재시도 시 결정적 통과). 제품 버그 아님 → 1회 재시도.
  retries: process.env.CI ? 2 : 1,
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
      `SUPABASE_SERVICE_ROLE_KEY=${LOCAL_SERVICE_ROLE_KEY}`,
      `pnpm --filter web dev --port ${PORT}`,
    ].join(" "),
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
