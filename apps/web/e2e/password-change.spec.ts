import { test, expect, type Page } from "@playwright/test";

// 비밀번호 변경 e2e:
//  1) 관리자가 신규 계정 생성 → 임시PW로 로그인하면 강제 변경 패널 → 변경 후 콘솔 진입
//  2) /admin/account 클라 검증(불일치)은 서버 도달 전에 막힘
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const NEW_EMAIL = "e2e-pwchange-newsales@jhtech.test";
const NEW_NAME = "E2E비번변경영업";
const NEW_PASSWORD = "newPass1234";

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
  // 로그인 서버액션 처리 + /admin/* 리다이렉트 완료까지 대기.
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).first().click();
}

test.beforeAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});
test.afterAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});

test("신규 계정 임시PW 로그인 → 강제 변경 패널 → 변경 후 콘솔 진입", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/users/new");
  await page.getByLabel("이름").fill(NEW_NAME);
  await page.getByLabel("이메일 (로그인 ID)").fill(NEW_EMAIL);
  await page.getByRole("button", { name: "계정 생성" }).click();
  const temp = await page.getByTestId("temp-password").innerText();
  expect(temp.length).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "닫기" }).click();
  await logout(page);

  // 임시PW로 로그인 → 강제 변경 패널이 떠야 함(콘솔 진입 차단).
  await login(page, NEW_EMAIL, temp);
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeVisible();

  // 변경 → 콘솔 진입.
  await page.getByLabel("현재 비밀번호").fill(temp);
  await page.getByLabel("새 비밀번호 (8자 이상)").fill(NEW_PASSWORD);
  await page.getByLabel("새 비밀번호 확인").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "비밀번호 변경하고 시작하기" }).click();
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeHidden();
});

test("/admin/account 새 비밀번호 불일치는 클라에서 막힘", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/account");
  await page.getByLabel("현재 비밀번호").fill("whatever12");
  await page.getByLabel("새 비밀번호 (8자 이상)").fill("abcdefgh1");
  await page.getByLabel("새 비밀번호 확인").fill("different1");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page.getByText("새 비밀번호가 일치하지 않습니다")).toBeVisible();
});
