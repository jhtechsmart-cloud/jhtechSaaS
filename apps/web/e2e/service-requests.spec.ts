import { test, expect, type Page } from "@playwright/test";

// M2 P-D — A/S신청 E2E. 공개 /support(미등록·등록 경로) + admin 목록·상태변경.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 다른 spec과 충돌 없는 전용 사업자번호(체크섬 유효).
const REG_BIZ = "6012345677";   // 등록 고객(시드)
const UNREG_BIZ = "5012345678"; // 미등록(시드 안 함)
const REG_CO = "E2E_AS등록사";
const UNREG_CO = "E2E_AS미등록사";
const EQ_LABEL = "E2E_AS장비";

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

async function cleanup() {
  for (const biz of [REG_BIZ, UNREG_BIZ]) {
    await rest(`service_requests?biz_no=eq.${biz}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  // companies 삭제 시 company_equipment는 cascade.
  await rest(`companies?biz_no=eq.${REG_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let companyId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\/equipment/, { timeout: 20_000 });
}

test.describe.serial("P-D A/S신청 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    // 등록 고객 + 보유장비 시드(assignee 없음 → SLA 일반문구, company_id는 세팅됨).
    const co = await rest("companies", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: REG_CO, biz_no: REG_BIZ, ceo: "김대표", phone: "02-111-2222", email: "reg@e2e.test", address: "서울시 강남구" }]),
    });
    if (!co.ok) throw new Error(`company 시드 실패: ${co.status} ${await co.text()}`);
    companyId = ((await co.json()) as Array<{ id: string }>)[0].id;
    const ce = await rest("company_equipment", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ company_id: companyId, label: EQ_LABEL }]),
    });
    if (!ce.ok) throw new Error(`equipment 시드 실패: ${ce.status} ${await ce.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("미등록 사업자번호 → 미확인 안내 + 직접입력 접수", async ({ page }) => {
    await page.goto("/support");
    await page.getByLabel("사업자등록번호로 조회").fill(UNREG_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(/미등록 사업자번호입니다/)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("회사명").fill(UNREG_CO);
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByLabel("고장 증상").fill("미등록 고객 증상 테스트");
    await page.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }).check();
    await page.getByRole("button", { name: "A/S 신청하기" }).click();

    await page.waitForURL(/\/support\/success\?no=AS-/, { timeout: 15_000 });
    await expect(page.getByText(/AS-\d{8}-\d{5,}/)).toBeVisible();
  });

  test("등록 고객 → 자동완성 + 장비선택 접수", async ({ page }) => {
    await page.goto("/support");
    await page.getByLabel("사업자등록번호로 조회").fill(REG_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(new RegExp(`${REG_CO} 확인됨`))).toBeVisible({ timeout: 15_000 });

    // 자동완성: 회사명 input에 REG_CO.
    await expect(page.getByLabel("회사명")).toHaveValue(REG_CO);
    // 보유장비 dropdown에서 선택.
    await page.getByLabel("A/S 신청 장비").selectOption({ label: EQ_LABEL });
    await page.getByLabel("고장 증상").fill("등록 고객 증상 테스트");
    await page.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }).check();
    await page.getByRole("button", { name: "A/S 신청하기" }).click();

    await page.waitForURL(/\/support\/success\?no=AS-/, { timeout: 15_000 });
  });

  test("DB 검증 — 미등록=company_id NULL, 등록=company_id 세팅", async () => {
    const unreg = await rest(`service_requests?biz_no=eq.${UNREG_BIZ}&select=company_id,status`, { method: "GET" });
    const unregRows = (await unreg.json()) as Array<{ company_id: string | null; status: string }>;
    expect(unregRows.length).toBe(1);
    expect(unregRows[0].company_id).toBeNull();
    expect(unregRows[0].status).toBe("received");

    const reg = await rest(`service_requests?biz_no=eq.${REG_BIZ}&select=company_id,company_equipment_id`, { method: "GET" });
    const regRows = (await reg.json()) as Array<{ company_id: string | null; company_equipment_id: string | null }>;
    expect(regRows.length).toBe(1);
    expect(regRows[0].company_id).toBe(companyId);
    expect(regRows[0].company_equipment_id).not.toBeNull();
  });

  test("admin 목록에서 접수 확인 → 상세 → 상태 변경(진행중)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/service-requests");
    // 등록사 접수건이 목록에 보임.
    await expect(page.getByText(REG_CO).first()).toBeVisible({ timeout: 15_000 });
    // 상세로 이동(행 클릭).
    await page.getByText(REG_CO).first().click();
    await page.waitForURL(/\/admin\/service-requests\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByText("신청 내용")).toBeVisible();
    // 상태 변경: 진행중.
    await page.getByRole("combobox").selectOption({ label: "진행중" });
    await page.getByRole("button", { name: "상태 변경" }).click();
    await expect(page.getByText("진행중").first()).toBeVisible({ timeout: 15_000 });
  });
});
