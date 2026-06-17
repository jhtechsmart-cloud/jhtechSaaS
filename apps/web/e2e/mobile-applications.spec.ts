import { test, expect, type Page } from "@playwright/test";

// 모바일 의뢰관리 E2E — 자가 시드 버전.
// REST(service_role)로 의뢰 1건 시드 → admin 로그인 → 목록에서 항목 탭 → 상세 → ‹ 목록 복귀.
// clean gate(db reset + seed-local)에서도 건너뛰지 않는다.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const APP_BIZ = "7712345670";
const APP_CO = "E2E_모바일의뢰사";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function cleanup() {
  // applications 삭제 — 이 스펙 고유 biz_no 행만 제거.
  await rest(`applications?biz_no=eq.${APP_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("모바일 의뢰관리 목록↔상세", () => {
  test.beforeAll(async () => {
    await cleanup();
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ company: APP_CO, biz_no: APP_BIZ, status: "new", fields: {} }]),
    });
    if (!res.ok) throw new Error(`application 시드 실패: ${res.status} ${await res.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("목록에서 항목 탭 → 상세 전환 → ‹ 목록 복귀", async ({ page }) => {
    await login(page);
    await page.goto("/admin/applications");

    // 시드한 의뢰를 회사명으로 확정적으로 찾는다.
    const item = page.locator('a[href^="/admin/applications/"]', { hasText: APP_CO }).first();
    await expect(item).toBeVisible({ timeout: 15_000 });

    // 탭 → 상세 라우트.
    await item.click();
    await expect(page).toHaveURL(/\/admin\/applications\/[^/]+/, { timeout: 15_000 });

    // ‹ 목록 뒤로가기 보임 + 클릭 → 목록 루트 복귀.
    const back = page.getByRole("link", { name: "‹ 목록" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/admin\/applications$/, { timeout: 15_000 });
  });
});
