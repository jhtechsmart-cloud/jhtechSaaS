import { test, expect, type Page } from "@playwright/test";

// #2/#3 수기견적 고객 연결 E2E — 고객 상세 "견적 작성" 딥링크 프리필 + 폼 내 고객 검색·선택.
// (저장 견적이 company_id로 고객 이력에 노출되는 것은 db-tests가 단언 — 여기선 UI 프리필/검색만.)
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const CO = "E2E_연결고객사";
const BIZ = "8112345670";
const CEO = "김연결";
const PHONE = "010-7777-8888";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function cleanup() {
  await rest(`companies?biz_no=eq.${BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let companyId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("수기견적 고객 연결", () => {
  test.beforeAll(async () => {
    await cleanup();
    const r = await rest("companies", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: CO, biz_no: BIZ, ceo: CEO, phone: PHONE, email: "link@example.com" }]),
    });
    if (!r.ok) throw new Error(`company 시드 실패: ${r.status} ${await r.text()}`);
    companyId = ((await r.json()) as { id: string }[])[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("고객 상세 '견적 작성' → 수기견적 폼에 고객 정보 프리필 + 연결 배지", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/customers/${companyId}`);
    await page.getByRole("link", { name: "견적 작성", exact: true }).click();
    await page.waitForURL(/\/admin\/quotes\/new\?company=/, { timeout: 20_000 });

    await expect(page.getByLabel("회사명")).toHaveValue(CO);
    await expect(page.getByLabel("대표자")).toHaveValue(CEO);
    await expect(page.getByLabel("연락처")).toHaveValue(PHONE);
    await expect(page.getByText("고객 연결됨")).toBeVisible();
  });

  test("폼 내 고객 검색 → 선택 → 회사 정보 프리필", async ({ page }) => {
    await login(page);
    await page.goto("/admin/quotes/new");

    // 초기엔 빈 폼.
    await expect(page.getByLabel("회사명")).toHaveValue("");
    // 검색 → Enter → 결과 클릭. (언더스코어는 sanitizer가 제거하므로 부분문자열로 검색)
    await page.getByLabel("고객 검색").fill("연결고객사");
    await page.getByLabel("고객 검색").press("Enter");
    await page.getByRole("button", { name: new RegExp(CEO) }).click();

    await expect(page.getByLabel("회사명")).toHaveValue(CO);
    await expect(page.getByLabel("대표자")).toHaveValue(CEO);
    await expect(page.getByText("고객 연결됨")).toBeVisible();
  });
});
