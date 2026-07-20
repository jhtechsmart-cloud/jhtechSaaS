import { test, expect, type Page } from "@playwright/test";

// admin 서비스 리포트 조회 콘솔 e2e (#228 Part 4) — 목록·필터 탭 렌더 + 사이드바 메뉴 노출.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test("admin 서비스 리포트 목록 — 메뉴·필터 탭·테이블 렌더", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  // 사이드바 메뉴(관리자 = users.manage super로 노출)
  await page.getByRole("link", { name: "서비스 리포트" }).first().click();
  await page.waitForURL(/\/admin\/service-reports/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "서비스 리포트", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /후속조치 대기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "무효" })).toBeVisible();
  // 테이블 헤더(데이터 유무 무관)
  await expect(page.getByRole("columnheader", { name: "번호" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "후속조치" })).toBeVisible();
});

// #246 Part 1b — 영업담당(읽기전용 service_reports.view)이 메뉴·목록에 접근한다.
// 이전에는 SALES_PRESET에 service_reports.* 키가 하나도 없어 메뉴가 숨겨지고 페이지도 403이었다.
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";

test("영업 계정(읽기전용 view) — 사이드바 메뉴 노출 + 목록 진입", async ({ page }) => {
  await login(page, SALES_EMAIL, SALES_PASSWORD);
  await expect(page.getByRole("link", { name: "서비스 리포트" }).first()).toBeVisible();
  await page.goto("/admin/service-reports");
  await expect(page.getByRole("heading", { name: "서비스 리포트", level: 1 })).toBeVisible();
  // 403 안내가 아니라 실제 콘솔이 떠야 한다
  await expect(page.getByText("권한이 없습니다")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "번호" })).toBeVisible();
});
