import { test, expect, type Page } from "@playwright/test";
import { makePng } from "./_png";

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

test("admin 서비스 리포트 목록 — 메뉴·KPI 5박스·탭 7종·테이블 렌더 + KPI 클릭=탭(#285)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  // 사이드바 메뉴(관리자 = users.manage super로 노출)
  await page.getByRole("link", { name: "서비스 리포트" }).first().click();
  await page.waitForURL(/\/admin\/service-reports/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "서비스 리포트", level: 1 })).toBeVisible();
  // KPI 5박스(집계 실패면 "—"가 아니라 숫자여야 한다 — DEFINER RPC)
  const kpis = page.getByTestId("report-kpis");
  for (const id of ["kpi-received", "kpi-follow", "kpi-awaiting-approval", "kpi-awaiting-tax", "kpi-completed"]) {
    await expect(kpis.getByTestId(id)).toBeVisible();
    await expect(kpis.getByTestId(id)).toContainText(/\d건/);
  }
  // 탭 7종
  for (const name of ["전체", "승인 대기", "세금계산서 미발행", "메일 미발송", "후속조치 대기", "완료", "무효"]) {
    await expect(page.getByRole("tab", { name: new RegExp(`^${name} \\d+$`) })).toBeVisible();
  }
  // 테이블 헤더(데이터 유무 무관)
  await expect(page.getByRole("columnheader", { name: "번호" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "메일" })).toBeVisible();
  // KPI 클릭 → 해당 탭(URL ?tab=) + aria-selected
  await kpis.getByTestId("kpi-awaiting-approval").click();
  await page.waitForURL(/tab=awaiting_approval/, { timeout: 20_000 });
  await expect(page.getByRole("tab", { name: /^승인 대기 \d+$/ })).toHaveAttribute("aria-selected", "true");
  // 탭 전환은 shallow(URL 동기)
  await page.getByRole("tab", { name: /^완료 \d+$/ }).click();
  await expect(page).toHaveURL(/tab=completed/);
  await expect(page.getByRole("button", { name: "이번 달" })).toBeVisible();
});

test("상세 — 없는 id는 안내 + 목록 링크(#285)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/service-reports/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("리포트를 찾을 수 없습니다").first()).toBeVisible();
  await page.getByRole("link", { name: "목록으로" }).click();
  await expect(page.getByRole("heading", { name: "서비스 리포트", level: 1 })).toBeVisible();
});

// #285 직인 등록(관리자) — approval-stamps 비공개 버킷에 <uid>/stamp-<ts>.png 업로드 → 미리보기 → 삭제.
test("사용자 상세 — 결재 직인 업로드·미리보기·삭제(#285)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/users");
  await page.getByRole("row", { name: new RegExp(ADMIN_EMAIL) }).click();
  await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const card = page.getByTestId("stamp-upload");
  await expect(card.getByText("결재 직인·서명 이미지")).toBeVisible();
  // 서버가 헤더를 읽어 형식·크기를 검증하므로 실제 320px PNG를 올린다(#285 #C)
  await card.locator('input[type="file"]').setInputFiles({ name: "stamp.png", mimeType: "image/png", buffer: makePng() });
  await expect(card.getByRole("img", { name: "직인 이미지" })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("승인 권한자는 직인이 필요합니다")).toHaveCount(0);
  // 이미지가 아닌 파일(이름만 .png)은 서버 검증이 거부한다
  await card.getByRole("button", { name: "직인 이미지 삭제" }).click();
  await expect(card.getByRole("img", { name: "직인 이미지" })).toHaveCount(0, { timeout: 15_000 });
  await card.locator('input[type="file"]').setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(card.getByText("이미지 파일이 아닙니다", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole("img", { name: "직인 이미지" })).toHaveCount(0);
  await expect(card.getByText("클릭 · 끌어다 놓기")).toBeVisible();
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
