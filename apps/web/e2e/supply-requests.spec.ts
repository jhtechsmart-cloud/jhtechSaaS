import { test, expect, type Page } from "@playwright/test";

// M2 P-E — 소모품신청 E2E. 공개 /supply(미등록·등록·빈매칭) + admin 목록·상태변경.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 다른 spec과 충돌 없는 전용 사업자번호(체크섬 유효).
const REG_BIZ = "7010000006";   // 등록 고객 + 보유장비 + 매칭 소모품
const EMPTY_BIZ = "7010000011"; // 등록됐으나 보유장비 0대(빈 매칭)
const UNREG_BIZ = "7010000025"; // 미등록(시드 안 함)
const REG_CO = "E2E_SUP등록사";
const EMPTY_CO = "E2E_SUP빈매칭사";
const EQ_NAME = "E2E_SUP장비";
const CONSUMABLE = "E2E_SUP_UV잉크";
const REQUESTER = "E2E_SUP구매자";

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
  // 1) 신청(요청자 기준) — items cascade. 2) 회사(company_equipment cascade). 3) 소모품(scope cascade). 4) 장비.
  await rest(`supply_requests?requester_name=eq.${encodeURIComponent(REQUESTER)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await rest(`companies?biz_no=in.(${REG_BIZ},${EMPTY_BIZ})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await rest(`consumables?name=eq.${encodeURIComponent(CONSUMABLE)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let companyId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("P-E 소모품신청 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    // 장비(분류 없이 직접 매핑) + 소모품 + scope(equipment 직접).
    const eq = await rest("equipment", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: EQ_NAME, base_price: 1, status: "active" }]),
    });
    if (!eq.ok) throw new Error(`equipment 시드 실패: ${eq.status} ${await eq.text()}`);
    const eqId = ((await eq.json()) as Array<{ id: string }>)[0].id;
    const cn = await rest("consumables", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: CONSUMABLE, unit: "개", status: "active" }]),
    });
    if (!cn.ok) throw new Error(`consumable 시드 실패: ${cn.status} ${await cn.text()}`);
    const cnId = ((await cn.json()) as Array<{ id: string }>)[0].id;
    const sc = await rest("consumable_scope", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ consumable_id: cnId, equipment_id: eqId }]),
    });
    if (!sc.ok) throw new Error(`scope 시드 실패: ${sc.status} ${await sc.text()}`);
    // 등록사 + 보유장비
    const co = await rest("companies", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: REG_CO, biz_no: REG_BIZ, ceo: "김대표", phone: "02-111-2222" }]),
    });
    if (!co.ok) throw new Error(`company 시드 실패: ${co.status} ${await co.text()}`);
    companyId = ((await co.json()) as Array<{ id: string }>)[0].id;
    const ce = await rest("company_equipment", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ company_id: companyId, equipment_id: eqId }]),
    });
    if (!ce.ok) throw new Error(`company_equipment 시드 실패: ${ce.status} ${await ce.text()}`);
    // 빈매칭사(보유장비 없음)
    const co2 = await rest("companies", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ name: EMPTY_CO, biz_no: EMPTY_BIZ }]),
    });
    if (!co2.ok) throw new Error(`빈매칭 company 시드 실패: ${co2.status} ${await co2.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("미등록 사업자번호 → 안내(폼 중단)", async ({ page }) => {
    await page.goto("/supply");
    await page.getByLabel("사업자등록번호로 조회").fill(UNREG_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(/미등록 사업자번호입니다/)).toBeVisible({ timeout: 15_000 });
  });

  test("등록됐으나 매칭 소모품 0종 → 빈 상태 안내", async ({ page }) => {
    await page.goto("/supply");
    await page.getByLabel("사업자등록번호로 조회").fill(EMPTY_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(/보유 장비에 등록된 소모품이 없습니다/)).toBeVisible({ timeout: 15_000 });
  });

  test("소모품 미선택 제출 → 에러 요약 배너에 안내(#1 회귀)", async ({ page }) => {
    await page.goto("/supply");
    await page.getByLabel("사업자등록번호로 조회").fill(REG_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(CONSUMABLE)).toBeVisible({ timeout: 15_000 });
    // 소모품 0개인 채로 신청자·동의만 채우고 제출 → RHF errors엔 없는 itemsError도 배너에 떠야 함.
    await page.getByLabel("신청자명").fill(REQUESTER);
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }).check();
    await page.getByRole("button", { name: "소모품 신청하기" }).click();
    const banner = page.getByRole("alert").filter({ hasText: "입력하지 않았거나 잘못된 항목이" });
    await expect(banner).toContainText("소모품을 1개 이상 선택");
    await expect(page).toHaveURL(/\/supply$/); // 제출 차단(미이동)
  });

  test("등록 고객 → 소모품 선택(수량)·신청자·동의 → 접수", async ({ page }) => {
    await page.goto("/supply");
    await page.getByLabel("사업자등록번호로 조회").fill(REG_BIZ);
    await page.getByRole("button", { name: "조회" }).click();
    await expect(page.getByText(new RegExp(`${REG_CO} 확인됨`))).toBeVisible({ timeout: 15_000 });
    // 매칭 소모품 표시 → 수량 + 버튼으로 1 증가
    await expect(page.getByText(CONSUMABLE)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: `${CONSUMABLE} 수량 증가` }).click();
    await page.getByLabel("신청자명").fill(REQUESTER);
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ }).check();
    await page.getByRole("button", { name: "소모품 신청하기" }).click();
    await page.waitForURL(/\/supply\/success\?no=SUP-/, { timeout: 15_000 });
    await expect(page.getByText(/SUP-\d{8}-\d{5,}/)).toBeVisible();
  });

  test("DB 검증 — 등록사 신청 1건 + 아이템 저장", async () => {
    const r = await rest(`supply_requests?company_id=eq.${companyId}&select=status,supply_request_items(qty,consumable_name_snapshot)`, { method: "GET" });
    const rows = (await r.json()) as Array<{ status: string; supply_request_items: Array<{ qty: number; consumable_name_snapshot: string }> }>;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("received");
    expect(rows[0].supply_request_items.length).toBe(1);
    expect(rows[0].supply_request_items[0].consumable_name_snapshot).toBe(CONSUMABLE);
    expect(rows[0].supply_request_items[0].qty).toBe(1);
  });

  test("admin 목록에서 접수 확인 → 상세 → 상태 변경(진행중)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/supply-requests");
    await expect(page.getByText(REG_CO).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(REG_CO).first().click();
    await page.waitForURL(/\/admin\/supply-requests\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByText("신청 소모품")).toBeVisible();
    await page.getByRole("combobox").selectOption({ label: "진행중" });
    await page.getByRole("button", { name: "상태 변경" }).click();
    await expect(page.getByText("진행중").first()).toBeVisible({ timeout: 15_000 });
  });
});
