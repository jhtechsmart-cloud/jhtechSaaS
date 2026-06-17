import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("모바일 의뢰관리 목록↔상세", () => {
  test("목록에서 항목 탭 → 상세 전환 → ‹ 목록 복귀", async ({ page }) => {
    await login(page);
    await page.goto("/admin/applications");

    // 목록의 첫 의뢰 링크(없으면 스킵 — 시드 상태에 따라).
    const firstItem = page.locator('a[href^="/admin/applications/"]').first();
    if ((await firstItem.count()) === 0) test.skip(true, "시드에 의뢰 없음");
    await expect(firstItem).toBeVisible({ timeout: 15_000 });

    // 탭 → 상세 라우트 + ‹ 목록 뒤로가기 보임.
    await firstItem.click();
    await expect(page).toHaveURL(/\/admin\/applications\/[^/]+/, { timeout: 15_000 });
    const back = page.getByRole("link", { name: "‹ 목록" });
    await expect(back).toBeVisible();

    // 뒤로가기 → 목록 루트.
    await back.click();
    await expect(page).toHaveURL(/\/admin\/applications$/, { timeout: 15_000 });
  });
});
