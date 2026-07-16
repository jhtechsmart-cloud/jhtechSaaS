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
