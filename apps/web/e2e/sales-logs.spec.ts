import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// 영업일지 E2E — 고객 상세에서 작성 → 표시 → 내 영업일지 모아보기 노출 → 삭제
// ──────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const COMPANY_NAME = "E2E영업일지사";
const LOG_TEXT = "헤드 3개 구성으로 재견적 필요 — E2E";

async function serviceRoleFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

let companyId = "";

test.beforeAll(async () => {
  // 잔여 정리(업체명 prefix) — sales_logs는 ON DELETE CASCADE.
  await serviceRoleFetch(`/rest/v1/companies?name=like.${encodeURIComponent("E2E영업일지%")}`, { method: "DELETE" });
  // 업체 시드(assignee 없이 — admin은 customers.view_all로 작성 가능).
  const res = await serviceRoleFetch("/rest/v1/companies", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: COMPANY_NAME }),
  });
  const rows = (await res.json()) as { id: string }[];
  companyId = rows[0].id;
});

test.afterAll(async () => {
  await serviceRoleFetch(`/rest/v1/companies?name=like.${encodeURIComponent("E2E영업일지%")}`, { method: "DELETE" });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test("고객 상세에서 영업일지 작성 → 표시 → 내 영업일지 모아보기 노출 → 삭제", async ({ page }) => {
  await login(page);

  // 1) 고객 상세 → 영업일지 작성
  await page.goto(`/admin/customers/${companyId}`);
  await page.getByRole("heading", { name: "영업일지", exact: true }).waitFor();
  await page.getByLabel("영업일지 작성").fill(LOG_TEXT);
  await page.getByRole("button", { name: "기록 추가" }).click();
  await expect(page.getByText(LOG_TEXT)).toBeVisible();

  // 2) 내 영업일지 모아보기 페이지에 노출
  await page.goto("/admin/sales-logs");
  await expect(page.getByRole("heading", { name: "내 영업일지" })).toBeVisible();
  await expect(page.getByText(LOG_TEXT)).toBeVisible();
  await expect(page.getByRole("link", { name: COMPANY_NAME })).toBeVisible();

  // 3) 고객 상세로 돌아가 삭제
  await page.goto(`/admin/customers/${companyId}`);
  await expect(page.getByText(LOG_TEXT)).toBeVisible();
  await page.getByRole("button", { name: "영업일지 삭제" }).click();
  await expect(page.getByText(LOG_TEXT)).toHaveCount(0);
});
