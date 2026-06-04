import { test, expect } from "@playwright/test";

// 공개 홈 3분기 — 견적요청·A/S·소모품 박스가 각 공개 페이지로 연결되는지(준비중 해제).
test.describe("홈 3분기 진입", () => {
  test("3개 박스 모두 활성 + 각 공개 페이지로 연결", async ({ page }) => {
    await page.goto("/");

    // 준비중 배지가 더 이상 없다(전부 활성).
    await expect(page.getByText("준비중")).toHaveCount(0);

    // 각 박스가 올바른 href를 가진다.
    await expect(page.getByRole("link", { name: /견적 요청/ })).toHaveAttribute("href", "/equipment");
    await expect(page.getByRole("link", { name: /A\/S 신청/ })).toHaveAttribute("href", "/support");
    await expect(page.getByRole("link", { name: /소모품 신청/ })).toHaveAttribute("href", "/supply");

    // 실제 이동 — A/S 박스 → /support 진입.
    await page.getByRole("link", { name: /A\/S 신청/ }).click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByRole("heading", { name: "A/S 신청" })).toBeVisible();

    // 소모품 박스 → /supply 진입.
    await page.goto("/");
    await page.getByRole("link", { name: /소모품 신청/ }).click();
    await expect(page).toHaveURL(/\/supply$/);
    await expect(page.getByRole("heading", { name: "소모품 신청" })).toBeVisible();
  });
});
