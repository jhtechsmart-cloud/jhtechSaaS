import { test, expect, type Page } from "@playwright/test";

// 사이드바 "사용 설명서" 링크 e2e.
// - 프로필 박스 바로 위에 링크가 있고, 새 창(target=_blank)으로 매뉴얼을 연다.
// - 매뉴얼 정적 파일(public/manual/index.html)이 실제로 서빙된다.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test("사이드바 사용 설명서 링크가 새 창으로 매뉴얼을 연다", async ({ page }) => {
  await login(page);
  const link = page.locator('aside a[href="/manual/index.html"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/사용 설명서/);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("매뉴얼 정적 파일이 서빙된다", async ({ page }) => {
  const res = await page.request.get("/manual/index.html");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("사용 설명서");
});
