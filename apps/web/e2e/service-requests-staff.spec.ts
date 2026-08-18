import { test, expect, type Page } from "@playwright/test";

// #281 A/S 대행 접수(직원 전용) E2E — 영업담당(SALES_PRESET, service_requests.create 포함) 로그인.
// ① 고객 상세 [A/S 접수] → 고정 회사 폼 → 접수 → 상세(전화 접수 배지·접수번호 토스트)
// ② A/S 목록 [+ 대행 접수] → 회사 피커 검색 → 선택 → 접수 → 상세
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";

const CO_NAME = "E2E_대행접수고객사";
const CO_BIZ = "7012345676"; // 전용 사업자번호(체크섬 유효, 다른 spec과 충돌 없음)

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

let salesId: string;
let companyId: string;

async function cleanup() {
  // 정리 키 = created_by(접수자) / 회사(biz_no). biz_no 기준으로 service_requests를 지우면 안 됨(스냅샷 null 가능).
  if (companyId) {
    await rest(`service_requests?company_id=eq.${companyId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  await rest(`companies?biz_no=eq.${CO_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(SALES_EMAIL);
  await page.getByLabel("비밀번호").fill(SALES_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("#281 A/S 대행 접수", () => {
  test.beforeAll(async () => {
    const prof = await rest("profiles?select=id&name=eq.영업담당&limit=1");
    salesId = ((await prof.json()) as Array<{ id: string }>)[0]?.id;
    if (!salesId) throw new Error("영업담당 시드 계정 없음 — seed-local 실행 필요");
    // 이전 실행 잔여 정리(회사는 biz_no로 찾아 접수 건 먼저 삭제).
    const prev = await rest(`companies?select=id&biz_no=eq.${CO_BIZ}`);
    for (const c of (await prev.json()) as Array<{ id: string }>) {
      await rest(`service_requests?company_id=eq.${c.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    }
    await cleanup();
    // 영업담당이 담당인 고객사 + 보유장비 1대 시드.
    const co = await rest("companies", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { name: CO_NAME, biz_no: CO_BIZ, ceo: "박대표", phone: "02-333-4444", address: "서울시 금천구", assignee_id: salesId },
      ]),
    });
    if (!co.ok) throw new Error(`company 시드 실패: ${co.status} ${await co.text()}`);
    companyId = ((await co.json()) as Array<{ id: string }>)[0].id;
    const ce = await rest("company_equipment", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ company_id: companyId, label: "E2E_대행장비", serial_no: "SN-281" }]),
    });
    if (!ce.ok) throw new Error(`equipment 시드 실패: ${ce.status} ${await ce.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("고객 상세 [A/S 접수] → 고정 회사 폼 → 접수 → 상세(전화 접수·접수자·배정=담당영업)", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/customers/${companyId}`);
    await page.getByRole("link", { name: "A/S 접수" }).click();
    await page.waitForURL(new RegExp(`/admin/service-requests/new\\?company=${companyId}`), { timeout: 15_000 });

    // 고정 회사: 피커 없음, 회사 칩 + 우측 카드에 회사명·전화.
    await expect(page.getByRole("combobox", { name: "고객사 검색" })).toHaveCount(0);
    await expect(page.getByText(CO_NAME).first()).toBeVisible();
    await expect(page.getByText("02-333-4444").first()).toBeVisible();

    // 보유장비 select에 시드 장비 노출 → 선택.
    const eqSelect = page.getByLabel("장비(보유장비에서 선택)");
    await expect(eqSelect.locator("option", { hasText: "E2E_대행장비" })).toHaveCount(1, { timeout: 10_000 });
    await eqSelect.selectOption({ index: 1 });

    await page.getByLabel("증상", { exact: true }).fill("헤드 노즐 막힘 — 전화 접수 e2e");
    await page.getByRole("radio", { name: "전화" }).check();
    await page.getByLabel(/개인정보 수집·이용 동의를 구두로/).check();
    await page.getByRole("button", { name: "A/S 접수" }).click();

    await page.waitForURL(/\/admin\/service-requests\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByText(/AS-\d{8}-\d+ 접수되었습니다/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("sr-channel")).toContainText("전화 접수");
    await expect(page.getByTestId("sr-channel")).toContainText("접수자 영업담당");
    // 배정 = 고객사 담당영업(영업담당 본인).
    await expect(page.getByText("담당영업", { exact: true }).locator("..")).toContainText("영업담당");
    // 통화자(대표 프리필) 표시.
    await expect(page.getByText("통화하신 분", { exact: true }).locator("..")).toContainText("박대표");
  });

  test("A/S 목록 [+ 대행 접수] → 피커 검색·선택 → 접수 → 상세; 목록에 전화 배지", async ({ page }) => {
    await login(page);
    await page.goto("/admin/service-requests");
    await page.getByRole("link", { name: "+ 대행 접수" }).click();
    await page.waitForURL(/\/admin\/service-requests\/new$/, { timeout: 15_000 });

    const box = page.getByRole("combobox", { name: "고객사 검색" });
    await box.fill("대행접수고객");
    const option = page.getByRole("option", { name: new RegExp(CO_NAME) });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    // 선택 후 칩 + [변경] 버튼, 피커 사라짐.
    await expect(page.getByRole("button", { name: "변경" })).toBeVisible();
    await expect(box).toHaveCount(0);

    await page.getByLabel("증상", { exact: true }).fill("방문 접수 e2e");
    await page.getByRole("radio", { name: "방문" }).check();
    await page.getByLabel(/개인정보 수집·이용 동의를 구두로/).check();
    await page.getByRole("button", { name: "A/S 접수" }).click();
    await page.waitForURL(/\/admin\/service-requests\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByTestId("sr-channel")).toContainText("방문 접수");

    // 목록에 배지 2종(전화·방문) 노출.
    await page.goto("/admin/service-requests");
    const rows = page.getByRole("row").filter({ hasText: CO_NAME });
    await expect(rows.filter({ hasText: "전화" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(rows.filter({ hasText: "방문" }).first()).toBeVisible();
  });
});
