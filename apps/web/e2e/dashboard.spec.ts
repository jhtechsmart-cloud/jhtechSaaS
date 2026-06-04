import { test, expect, type Page } from "@playwright/test";

// E5b — 대시보드 E2E. 데이터 상태에 무관하게(빈상태/액션큐 둘 중 하나) 안정적으로 검증한다.
//  A) 로그인 후 첫화면이 /admin/dashboard 이고 h1 "대시보드"가 보인다.
//  B) /admin/dashboard 진입 시 빈상태 카드 또는 액션큐 중 하나가 보인다(시드 불요).
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 다른 spec과 동일한 로그인 메커니즘(getByLabel + 로그인 버튼).
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 후 랜딩은 콘솔(/admin/...). E5b부터 첫화면이 /admin/dashboard 로 이동.
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("E5b 대시보드 E2E", () => {
  test("로그인 후 첫화면 = /admin/dashboard + 헤딩 노출", async ({ page }) => {
    await login(page);
    // 첫화면 URL 단언(E5b 랜딩 전환).
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible({ timeout: 15_000 });
  });

  test("대시보드 = 빈상태 또는 액션큐 중 하나 렌더(데이터 무관)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible({ timeout: 15_000 });
    // 데이터가 0이면 빈상태 카드, 1건 이상이면 액션큐 — 둘 중 하나만 보이면 통과.
    const emptyOrQueue = page
      .getByTestId("dashboard-empty")
      .or(page.getByTestId("dashboard-action-queue"));
    await expect(emptyOrQueue.first()).toBeVisible({ timeout: 15_000 });
  });
});
