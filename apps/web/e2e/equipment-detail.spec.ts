import { test, expect, type Page } from "@playwright/test";

// #243 장비 상세 + AS 이력 탭 — 진입·탭 URL 보존·권한(영업 view 읽기전용)·404.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";

const EQ_NAME = "E2E상세검증프린터";

// 로컬 Supabase 서비스롤 — 시드·정리용(비밀 아님, 공개 표준 데모 키).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function sr(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("장비 상세 + AS 이력", () => {
  let equipmentId = "";

  test.beforeAll(async () => {
    const res = await sr("/rest/v1/equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: EQ_NAME, model: "E2E-DTL-1", base_price: 1000000 }),
    });
    const rows = (await res.json()) as { id: string }[];
    equipmentId = rows[0].id;
  });

  test.afterAll(async () => {
    await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, { method: "DELETE" });
  });

  test("관리자 — 목록 이름 클릭 → 상세(헤더·개요) → AS 이력 탭 전환·URL 보존", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/equipment");
    await page.getByRole("link", { name: EQ_NAME, exact: true }).click();
    await page.waitForURL(new RegExp(`/admin/equipment/${equipmentId}$`), { timeout: 20_000 });
    // 고정 헤더 + 개요 탭 기본
    await expect(page.getByRole("heading", { name: EQ_NAME, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "수정" })).toBeVisible();
    await expect(page.getByText("기본공급가")).toBeVisible();
    // 이력 탭 전환 → URL 쿼리 + 빈 상태(리포트 0건은 에러 아님)
    await page.getByRole("tab", { name: "AS 이력" }).click();
    await page.waitForURL(/tab=history/, { timeout: 20_000 });
    await expect(page.getByText("발행된 A/S 리포트가 없습니다")).toBeVisible();
    // 새로고침 후 탭 유지
    await page.reload();
    await expect(page.getByText("발행된 A/S 리포트가 없습니다")).toBeVisible();
    await expect(page.getByRole("tab", { name: "AS 이력" })).toHaveAttribute("aria-selected", "true");
  });

  // #244 통계 탭 — 발행 리포트는 시드 불가(트리거가 service_role에도 draft 강제) → 0건 상태로 검증.
  // 데이터 있는 집계는 unit(service-stats.test.ts ~24개)이 담당한다.
  test("통계 탭(#244) — 0건 빈 상태·ARIA 배선·3탭 방향키 순환", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/admin/equipment/${equipmentId}?tab=stats`);
    // 0건 빈 상태 — 에러·NaN 없이 렌더
    await expect(page.getByText("통계를 낼 발행 리포트가 없습니다")).toBeVisible();
    await expect(page.getByText("NaN")).toHaveCount(0);
    // ARIA 배선
    const statsTab = page.getByRole("tab", { name: "통계" });
    await expect(statsTab).toHaveAttribute("aria-selected", "true");
    await expect(statsTab).toHaveAttribute("aria-controls", "tabpanel-stats");
    await expect(page.locator("#tabpanel-stats")).toBeVisible();
    // 방향키 순환: 통계 → ArrowRight → 개요(순환)
    await statsTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    // 새로고침 시 탭 보존
    await page.goto(`/admin/equipment/${equipmentId}?tab=stats`);
    await page.reload();
    await expect(page.getByRole("tab", { name: "통계" })).toHaveAttribute("aria-selected", "true");
  });

  test("영업(view) — 사이드바 노출·상세 진입 가능·수정 버튼 없음", async ({ page }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await expect(page.getByRole("link", { name: "장비", exact: true }).first()).toBeVisible();
    await page.goto(`/admin/equipment/${equipmentId}`);
    await expect(page.getByRole("heading", { name: EQ_NAME, level: 1 })).toBeVisible();
    await expect(page.getByText("접근 권한이 없습니다")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "수정" })).toHaveCount(0);
    // 목록에도 쓰기 UI 미노출
    await page.goto("/admin/equipment");
    await expect(page.getByRole("link", { name: "+ 새 장비" })).toHaveCount(0);
  });

  test("영업(view) — edit/new 직접 접근은 권한 없음 화면(폼 미렌더)", async ({ page }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto(`/admin/equipment/${equipmentId}/edit`);
    await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
    await expect(page.getByRole("heading", { name: "장비 수정" })).toHaveCount(0);
    await page.goto("/admin/equipment/new");
    await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
    await expect(page.getByRole("heading", { name: "장비 추가" })).toHaveCount(0);
  });

  test("비UUID·불존재 id → 404 화면", async ({ page }) => {
    // 스트리밍 셸이 먼저 흘러 HTTP status는 200일 수 있음 — 화면 기준으로 단언.
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/equipment/not-a-uuid");
    await expect(page.getByText("This page could not be found")).toBeVisible();
    await page.goto("/admin/equipment/00000000-0000-4000-8000-0000000000ff");
    await expect(page.getByText("This page could not be found")).toBeVisible();
  });
});
