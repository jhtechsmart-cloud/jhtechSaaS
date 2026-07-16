import { test, expect, type Page, type Locator } from "@playwright/test";
import { SALES_PRESET } from "@jhtechsaas/shared";

// 권한 피커 개편 e2e (#227):
//  1) 영업담당 라디오 선택 → 그리드가 항상 펼쳐져 SALES_PRESET이 체크된 상태
//  2) 키 1개 해제 + 1개 추가 → 라디오가 '직접설정'으로 이동
//  3) 그 상태로 계정 생성 → 편집 화면 재진입 시 편집된 체크 상태가 그대로 반영
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const NEW_EMAIL = "e2e-permpicker-sales@jhtech.test";
const NEW_NAME = "E2E권한피커영업";
// 프리셋에서 뺄 키 / 더할 키 (라벨은 registry 기준)
const REMOVE_KEY = "email.send"; // 견적 메일발송
const ADD_KEY = "equipment.manage"; // 장비 카탈로그 관리

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

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

// 그리드 행은 <label>체크박스 + 라벨 + mono 키</label> 구조 — key 텍스트로 행을 특정.
function keyCheckbox(page: Page, key: string): Locator {
  return page
    .locator("label", { has: page.locator(`text="${key}"`) })
    .locator('input[type="checkbox"]');
}

test.beforeAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});
test.afterAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});

test("프리셋=편집 가능한 시드: 영업담당 선택→그리드 편집→직접설정 전환→저장·재진입 반영", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/users/new");

  // 1) 영업담당 선택 → 그리드가 보이고 SALES_PRESET 전부 체크
  await page.getByRole("radio", { name: "영업담당" }).check();
  for (const key of SALES_PRESET) {
    await expect(keyCheckbox(page, key)).toBeChecked();
  }
  await expect(keyCheckbox(page, ADD_KEY)).not.toBeChecked();

  // 2) 키 1개 해제 + 1개 추가 → 라디오가 '직접설정'으로 이동
  await keyCheckbox(page, REMOVE_KEY).uncheck();
  await keyCheckbox(page, ADD_KEY).check();
  await expect(page.getByRole("radio", { name: "직접설정" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "영업담당" })).not.toBeChecked();

  // 3) 편집된 권한으로 계정 생성 → 편집 화면에서 체크 상태 그대로 반영
  await page.getByLabel("이름").fill(NEW_NAME);
  await page.getByLabel("이메일 (로그인 ID)").fill(NEW_EMAIL);
  await page.getByRole("button", { name: "계정 생성" }).click();
  await expect(page.getByTestId("temp-password")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "닫기" }).click();

  await page.goto("/admin/users");
  await page.getByRole("link", { name: NEW_NAME }).first().click();
  await page.waitForURL(/\/admin\/users\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(keyCheckbox(page, REMOVE_KEY)).not.toBeChecked();
  await expect(keyCheckbox(page, ADD_KEY)).toBeChecked();
  await expect(keyCheckbox(page, "applications.claim")).toBeChecked();
  await expect(page.getByRole("radio", { name: "직접설정" })).toBeChecked();
});
