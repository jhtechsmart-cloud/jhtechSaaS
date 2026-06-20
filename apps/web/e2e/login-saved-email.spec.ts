import { test, expect, type Page } from "@playwright/test";

// 로그인 화면 "아이디 저장" e2e.
// 핵심 회귀: 다른 아이디 입력 후 로그인이 실패하면(리다이렉트 없음) 사용자가 방금
// 친 아이디가 옛 저장값으로 되돌아가던 버그(React 19 form action 자동 초기화) 방지.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";

const emailInput = (page: Page) => page.getByLabel("이메일");
const rememberCb = (page: Page) => page.getByRole("checkbox");

async function loginSuccess(page: Page, email: string, password: string) {
  await page.goto("/login");
  await emailInput(page).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  if (!(await rememberCb(page).isChecked())) await rememberCb(page).check();
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).first().click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
}

test("로그인 실패 시 방금 입력한 아이디가 옛 저장값으로 회귀하지 않는다", async ({
  page,
}) => {
  // admin 으로 성공 로그인 → admin 저장
  await loginSuccess(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await logout(page);

  // 재방문: admin 프리필
  await page.goto("/login");
  await expect(emailInput(page)).toHaveValue(ADMIN_EMAIL);

  // 다른 아이디 + 틀린 비번 → 로그인 실패
  await emailInput(page).fill(SALES_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-password-xyz");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("올바르지 않습니다")).toBeVisible();

  // 입력칸은 방금 친 아이디를 유지해야 한다(옛 admin 으로 회귀 금지)
  await expect(emailInput(page)).toHaveValue(SALES_EMAIL);
});

test("저장된 아이디는 가장 최근에 성공 로그인한 아이디로 갱신된다", async ({
  page,
}) => {
  await loginSuccess(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await logout(page);

  // sales 로 바꿔 성공 로그인 → sales 로 갱신
  await page.goto("/login");
  await emailInput(page).fill(SALES_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(SALES_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
  await logout(page);

  // 재방문 프리필 = sales(최신)
  await page.goto("/login");
  await expect(emailInput(page)).toHaveValue(SALES_EMAIL);
});

test("아이디 저장 체크 해제 후 로그인하면 저장이 지워진다", async ({ page }) => {
  await loginSuccess(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await logout(page);

  // 재방문: 프리필+체크됨 → 체크 해제 후 로그인
  await page.goto("/login");
  await expect(emailInput(page)).toHaveValue(ADMIN_EMAIL);
  await rememberCb(page).uncheck();
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
  await logout(page);

  // 재방문: 프리필 비어 있음
  await page.goto("/login");
  await expect(emailInput(page)).toHaveValue("");
});
