import { test, expect, type Page } from "@playwright/test";

// 모바일(390px) 햄버거 드로어 — 데스크톱 사이드바는 숨고 ☰로 메뉴 이동.
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

test.describe.serial("모바일 햄버거 드로어", () => {
  test("☰로 드로어 열고 메뉴 이동 + 자동 닫힘", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");

    // 모바일: 드로어 메뉴는 처음엔 안 보임, ☰ 버튼은 보임.
    const drawerNav = page.getByRole("complementary", { name: "모바일 메뉴" });
    await expect(drawerNav).toBeHidden();
    const hamburger = page.getByRole("button", { name: "메뉴 열기" });
    await expect(hamburger).toBeVisible({ timeout: 15_000 });

    // 열기 → 드로어 내 '고객' 링크 보임.
    await hamburger.click();
    await expect(drawerNav).toBeVisible();
    const customers = drawerNav.getByRole("link", { name: "고객" });
    await expect(customers).toBeVisible();

    // 메뉴 선택 → 이동 + 드로어 자동 닫힘.
    await customers.click();
    await expect(page).toHaveURL(/\/admin\/customers/, { timeout: 15_000 });
    await expect(drawerNav).toBeHidden();
  });

  test("배경 탭으로 닫힘", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    const drawerNav = page.getByRole("complementary", { name: "모바일 메뉴" });
    await expect(drawerNav).toBeVisible();
    // 배경 버튼은 드로어(w-64=256px) 오른쪽 영역에 위치 — 드로어 밖 좌표 클릭으로 닫힘.
    // absolute inset-0 배경 전체가 버튼이지만 드로어 aside(z-10)가 왼쪽을 덮으므로
    // 뷰포트 오른쪽(x=340, y=400)을 직접 탭해 배경 닫기를 트리거한다.
    await page.mouse.click(340, 400);
    await expect(drawerNav).toBeHidden();
  });
});
