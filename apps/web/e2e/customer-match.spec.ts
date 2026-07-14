import { test, expect, type Page } from "@playwright/test";

// 견적요청 ↔ 기존 고객 매칭 E2E — 목록 배지 + 상세 매칭 패널 + "이 고객으로 연결".
// 자체 시드(REST service_role + 고유 biz_no) — 클린 게이트에서 skip 없이 돈다.
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const CO = "E2E매칭고객사";
const BIZ = "8212345675"; // 시드 전용(체크섬 무관 — DB CHECK는 10자리 형식만)
const CO_NAME_ONLY = "E2E동명업체";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function cleanup() {
  // 시드 이름 전수 나열(와일드카드 금지 — 병렬 실행 중인 다른 스펙의 시드 오삭제 방지).
  const appNames = [`${CO}오타`, `${CO}오타2`, CO_NAME_ONLY].map((n) => `"${n}"`).join(",");
  await rest(`applications?company=in.(${appNames})`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await rest(`companies?name=in.("${CO}","${CO_NAME_ONLY}")`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function seedCompany(body: Record<string, unknown>): Promise<string> {
  const r = await rest("companies", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([body]),
  });
  if (!r.ok) throw new Error(`company 시드 실패: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: string }[])[0].id;
}

async function seedApplication(body: Record<string, unknown>): Promise<string> {
  const r = await rest("applications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([body]),
  });
  if (!r.ok) throw new Error(`application 시드 실패: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: string }[])[0].id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("견적요청 기존 고객 매칭", () => {
  let appBizId: string; // 사업자번호 일치(미연결) 의뢰
  let appNameId: string; // 동명(사업자번호 불일치) 의뢰

  test.beforeAll(async () => {
    await cleanup();
    await seedCompany({ name: CO, biz_no: BIZ, ceo: "김기존", phone: "010-1111-2222", address: "서울 본사" });
    await seedCompany({ name: CO_NAME_ONLY, biz_no: null, ceo: "박동명" });
    // 요청값에 오타(회사명·연락처 다름) — 사업자번호로만 매칭되는 케이스.
    appBizId = await seedApplication({
      company: `${CO}오타`, biz_no: "821-23-45675", ceo: "김기존", phone: "010-9999-0000",
      status: "new", source: "public", fields: {},
    });
    // 회사명만 같고 사업자번호가 다른 케이스.
    appNameId = await seedApplication({
      company: CO_NAME_ONLY, biz_no: "9998887771", ceo: "박동명",
      status: "new", source: "public", fields: {},
    });
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("biz_no 일치 → 매칭 패널 + '이 고객으로 연결'(교정 없이) → 등록 고객 반영", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/applications/${appBizId}`);

    const panel = page.getByTestId("customer-match-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("사업자번호가 일치하는 기존 고객");
    await panel.getByRole("button", { name: "이 고객으로 연결" }).click();

    // 값 차이(회사명·연락처)가 있어 교정 모달이 뜬다 — 기본(그대로 두기)으로 연결만.
    const dialog = page.getByRole("dialog", { name: "고객 연결 및 정보 교정" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "연결하기" }).click();

    // 연결되면 패널이 사라지고 '등록 고객' 배지 유지 + DB company_id 세팅.
    await expect(page.getByTestId("customer-match-panel")).toHaveCount(0);
    const r = await rest(`applications?id=eq.${appBizId}&select=company_id`);
    const rows = (await r.json()) as { company_id: string | null }[];
    expect(rows[0]?.company_id).toBeTruthy();
  });

  test("name_only(동명·사업자번호 불일치) → 코랄 경고 패널 + 목록 '확인 필요' 배지", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/applications/${appNameId}`);

    const panel = page.getByTestId("customer-match-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("회사명이 같은 고객이 있습니다");

    // 좌측 목록(신청 목록)에서 해당 의뢰 행에 '확인 필요' 칩.
    const listRow = page.getByRole("link", { name: new RegExp(CO_NAME_ONLY) }).first();
    await expect(listRow.getByText("확인 필요")).toBeVisible();
  });

  test("고객DB값으로 요청 교정 — 회사명 오타를 기존 고객 이름으로", async ({ page }) => {
    // 새 의뢰(오타 회사명, biz_no 일치)를 시드해 교정 경로 검증.
    const appId = await seedApplication({
      company: `${CO}오타2`, biz_no: BIZ, status: "new", source: "public", fields: {},
    });
    await login(page);
    await page.goto(`/admin/applications/${appId}`);
    await page.getByTestId("customer-match-panel").getByRole("button", { name: "이 고객으로 연결" }).click();

    const dialog = page.getByRole("dialog", { name: "고객 연결 및 정보 교정" });
    await dialog.getByLabel("회사명 처리").selectOption("company"); // 고객DB값으로 요청 교정
    await dialog.getByRole("button", { name: "연결하기" }).click();

    await expect(page.getByTestId("customer-match-panel")).toHaveCount(0);
    const r = await rest(`applications?id=eq.${appId}&select=company,company_id`);
    const rows = (await r.json()) as { company: string; company_id: string | null }[];
    expect(rows[0]?.company).toBe(CO);
    expect(rows[0]?.company_id).toBeTruthy();

    await rest(`applications?id=eq.${appId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  });
});
