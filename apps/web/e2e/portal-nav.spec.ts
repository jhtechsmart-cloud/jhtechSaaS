import { test, expect } from "@playwright/test";

// 고객 포털 공통 셸 — 상단바(데스크톱)·하단 탭바(모바일)가 모든 공개 페이지에서 동작하는지.
// 헤더(banner)·탭바(nav[aria-label]) 영역으로 스코프해 홈 카드 풀네임과의 중복 매칭을 피한다.
test.describe("포털 네비게이션", () => {
  test("데스크톱 상단바 — 메뉴 이동 + active 표시", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/support");

    const header = page.getByRole("banner");
    // 짧은 라벨 3종이 헤더에 존재.
    await expect(header.getByRole("link", { name: "견적", exact: true })).toHaveAttribute(
      "href",
      "/equipment",
    );
    await expect(header.getByRole("link", { name: "A/S", exact: true })).toHaveAttribute(
      "href",
      "/support",
    );
    await expect(header.getByRole("link", { name: "소모품", exact: true })).toHaveAttribute(
      "href",
      "/supply",
    );

    // 현재 /support → A/S 메뉴가 active(aria-current).
    await expect(header.getByRole("link", { name: "A/S", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 헤더에서 견적 메뉴 클릭 → 카탈로그.
    await header.getByRole("link", { name: "견적", exact: true }).click();
    await expect(page).toHaveURL(/\/equipment$/);
  });

  test("모바일 하단 탭바 — 엄지 탭 이동", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");

    const tabbar = page.getByRole("navigation", { name: "기능 이동" });
    await expect(tabbar).toBeVisible();

    // 소모품 탭 → /supply.
    await tabbar.getByRole("link", { name: "소모품", exact: true }).click();
    await expect(page).toHaveURL(/\/supply$/);
    await expect(page.getByRole("heading", { name: "소모품 신청" })).toBeVisible();
  });
});
