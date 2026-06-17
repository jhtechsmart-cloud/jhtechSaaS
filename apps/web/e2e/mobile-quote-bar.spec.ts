import { test, expect, type Page } from "@playwright/test";

// 모바일 견적 하단 고정 바 — 수기견적(/admin/quotes/new) 화면에서 검증.
// lg 미만: 하단 바 노출 + 공급가 실시간 반영. lg 이상: 하단 바 숨김(우측 요약이 대신).
// 데이터 생성(발행) 없이 레이아웃·합계만 검증(발행 흐름은 quotes.spec.ts가 데스크톱서 커버).
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("모바일 견적 하단 고정 바", () => {
  test("모바일: 하단 바 노출 + 공급가 반영, 데스크톱: 숨김", async ({ page }) => {
    await login(page);

    // 모바일 뷰포트
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/quotes/new");

    const bar = page.getByTestId("quote-bottom-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(bar.getByText("공급가")).toBeVisible();
    // 바 안의 발행하기 버튼 존재
    await expect(bar.getByRole("button", { name: "발행하기" })).toBeVisible();

    // 장비 단가 입력 → 바의 공급가 숫자에 반영
    await page.getByLabel("장비 단가").fill("1000000");
    await page.getByLabel("장비 수량").fill("1");
    await expect(bar).toContainText("1,000,000");

    // 데스크톱 뷰포트로 넓히면 하단 바 숨김
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });
});
