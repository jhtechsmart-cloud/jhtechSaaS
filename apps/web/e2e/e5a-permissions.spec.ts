import { test, expect, type Page } from "@playwright/test";

// E5a — 권한 모델 E2E (3 시나리오):
//  1) 영업담당: 콘솔 진입(#29) + nav 권한별 노출 + 미배정 견적 self-claim + 상태변경 (재배정 불가)
//  2) 관리자: /admin/users에서 계정 생성 → 임시PW 1회 모달 → 그 PW로 신규 계정 재로그인 성공
//  3) is_active=false 계정은 로그인해도 콘솔 진입 차단(가드)
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const SALES_EMAIL = "sales@jhtech.local";
const SALES_PASSWORD = "jhtech-sales-dev";

// 시나리오 1 전용 — 미배정 견적.
const APP_BIZ = "8012345670";
const APP_CO = "E2E_권한_미배정견적사";
let appId = "";
// 시나리오 2·3 전용 — 새로 만들 계정.
const NEW_EMAIL = "e2e-step7-newsales@jhtech.test";
const NEW_NAME = "E2E신규영업";
let newPassword = "";

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

function authAdmin(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function deleteAuthUserByEmail(email: string) {
  const res = await authAdmin("users?per_page=1000").catch(() => null);
  if (!res || !res.ok) return;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (body.users ?? []).find((x) => x.email === email);
  if (u) await authAdmin(`users/${u.id}`, { method: "DELETE" }).catch(() => {});
}

async function cleanup() {
  await rest(`applications?biz_no=eq.${APP_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await deleteAuthUserByEmail(NEW_EMAIL);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).first().click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

test.describe.serial("E5a 권한 모델 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    // 미배정 견적 1건(status='new', assignee null) 시드. id 캡처(상세 직접 진입용).
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { company: APP_CO, ceo: "김대표", biz_no: APP_BIZ, phone: "010-1111-2222", status: "new", fields: { requirements: "권한 E2E" } },
      ]),
    });
    const rows = (await res.json()) as { id: string }[];
    appId = rows[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("1: 영업담당 콘솔 진입 + nav 권한별 노출 + 미배정 claim + 상태변경", async ({ page }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    // #29 해소 — 영업도 콘솔 진입(403 아님). 랜딩은 운영 허브.
    await page.waitForURL(/\/admin\//, { timeout: 20_000 });
    await expect(page.getByText("접근 권한이 없습니다")).toHaveCount(0);

    // nav 데이터화(사이드바 href 기준 — 배지 aria-label 영향 없이 견고) — 영업은 운영 4개만.
    const nav = page.locator("aside");
    await expect(nav.locator('a[href="/admin/applications"]')).toBeVisible();
    await expect(nav.locator('a[href="/admin/customers"]')).toBeVisible();
    await expect(nav.locator('a[href="/admin/service-requests"]')).toBeVisible();
    await expect(nav.locator('a[href="/admin/supply-requests"]')).toBeVisible();
    await expect(nav.locator('a[href="/admin/equipment"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/admin/consumables"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/admin/categories"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/admin/users"]')).toHaveCount(0);

    // 미배정 견적 상세 직접 진입(RLS: 영업은 미배정 풀을 본다).
    await page.goto(`/admin/applications/${appId}`);
    // 2분할: 회사명이 좌측 목록 패널 + 우측 상세 양쪽에 보이므로 first()로 단언.
    await expect(page.getByText(APP_CO).first()).toBeVisible({ timeout: 15_000 });

    // 미배정 → "내가 맡기" 버튼 노출, 재배정(staff select)은 없음.
    await expect(page.getByRole("button", { name: "내가 맡기" })).toBeVisible();
    await expect(page.locator("select")).toHaveCount(0); // 배정 select·상태 select 둘 다 아직 없음

    // self-claim → assignee=본인, status new→assigned auto-bump.
    await page.getByRole("button", { name: "내가 맡기" }).click();
    await expect(page.getByRole("button", { name: "내가 맡기" })).toHaveCount(0, { timeout: 15_000 });
    // 상세(main)의 담당자 표시. 메인 사이드바 프로필 라벨도 "영업담당"이라(접힘 시 hidden) main으로 스코프.
    await expect(page.locator("main").getByText("영업담당").first()).toBeVisible();

    // 맡은 뒤 상태 변경 가능(StatusControl select 1개 등장).
    const statusSelect = page.locator("select");
    await expect(statusSelect).toHaveCount(1);
    await statusSelect.selectOption({ label: "견적중" });
    await page.getByRole("button", { name: "상태 변경" }).click();
    await expect(page.locator("select")).toHaveValue("quoted", { timeout: 15_000 });
  });

  test("2: 관리자 계정 생성 → 임시PW 1회 모달 → 신규 계정 재로그인 성공", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin\//, { timeout: 20_000 });

    await page.goto("/admin/users/new");
    await page.getByLabel("이름").fill(NEW_NAME);
    await page.getByLabel("이메일 (로그인 ID)").fill(NEW_EMAIL);
    // 프리셋 기본 = 영업담당. 그대로 생성.
    await page.getByRole("button", { name: "계정 생성" }).click();

    // 임시 PW 1회 모달 — mono 비밀번호 캡처.
    const pwEl = page.getByTestId("temp-password");
    await expect(pwEl).toBeVisible({ timeout: 15_000 });
    newPassword = (await pwEl.textContent())?.trim() ?? "";
    expect(newPassword.length).toBeGreaterThanOrEqual(12);
    await page.getByRole("button", { name: "닫기" }).click();
    await page.waitForURL(/\/admin\/users$/, { timeout: 15_000 });
    await expect(page.getByText(NEW_EMAIL)).toBeVisible();

    // 관리자 로그아웃 → 신규 계정으로 재로그인 → 콘솔 진입(영업 프리셋 → applications 허브).
    await logout(page);
    await login(page, NEW_EMAIL, newPassword);
    await page.waitForURL(/\/admin\//, { timeout: 20_000 });
    await expect(page.getByText("접근 권한이 없습니다")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "견적", exact: true })).toBeVisible();
  });

  test("3: 비활성(is_active=false) 계정은 로그인해도 콘솔 진입 차단", async ({ page }) => {
    // 신규 계정 비활성화 — service_role로 profiles.is_active=false (auth id 조회 후).
    const listRes = await authAdmin("users?per_page=1000");
    const body = (await listRes.json()) as { users?: { id: string; email?: string }[] };
    const u = (body.users ?? []).find((x) => x.email === NEW_EMAIL);
    expect(u, "신규 계정이 존재해야 함").toBeTruthy();
    const patch = await rest(`profiles?id=eq.${u!.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false }),
    });
    expect(patch.ok).toBeTruthy();

    // 비활성 계정 로그인 → 가드가 forbidden 패널 렌더(콘솔 진입 차단).
    await login(page, NEW_EMAIL, newPassword);
    await expect(
      page.getByText("콘솔 접근 권한이 없거나 비활성 계정입니다."),
    ).toBeVisible({ timeout: 20_000 });
  });
});
