import { test, expect, type Page } from "@playwright/test";

// 모바일 대시보드 — 2주 캘린더·주간 차트(7열 고정)가 뷰포트 안 가로 스크롤 컨테이너에 담겨,
// 칸이 뭉개지지 않고(내용이 더 넓어 스크롤 가능) 페이지를 가로로 밀어내지 않는지 검증.
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

test.describe.serial("모바일 대시보드 가로 스크롤", () => {
  test("캘린더·차트가 뷰포트 안 스크롤 컨테이너에 담김", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");

    await expect(page.getByText("일정", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("주간 활동")).toBeVisible();

    // 캘린더: 내용(min-width 680)이 컨테이너보다 넓어 스크롤 가능 + 컨테이너는 뷰포트 안에 들어옴.
    const cal = await page.getByTestId("calendar-scroll").evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(cal.scroll).toBeGreaterThan(cal.client); // 칸이 안 뭉개짐(가로 스크롤)
    expect(cal.client).toBeLessThanOrEqual(cal.viewport); // 페이지를 밀어내지 않음

    // 주간 차트도 동일 패턴.
    const chart = await page.getByTestId("weekly-chart-scroll").evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(chart.scroll).toBeGreaterThan(chart.client);
    expect(chart.client).toBeLessThanOrEqual(chart.viewport);
  });
});
