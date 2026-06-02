import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const TOP = "E2E대분류프린터";
const SUB = "E2E소분류UV";

// 로컬 Supabase 서비스롤 — afterAll 정리용(비밀 아님, 공개 표준 데모 키).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// 서비스롤로 REST API 호출하는 헬퍼.
async function sr(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

// 관리자 로그인 헬퍼 — LoginForm.tsx의 label/button 텍스트 기준.
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 성공 시 /admin 계열로 리다이렉트
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
}

test.describe.serial("장비 분류 CRUD", () => {
  // 테스트 종료 후 E2E용 분류 데이터 정리 — 소분류 먼저(FK), 대분류 나중.
  test.afterAll(async () => {
    await sr(
      `/rest/v1/equipment_category?name=eq.${encodeURIComponent(SUB)}`,
      { method: "DELETE" },
    );
    await sr(
      `/rest/v1/equipment_category?name=eq.${encodeURIComponent(TOP)}`,
      { method: "DELETE" },
    );
  });

  test("대분류·소분류 추가", async ({ page }) => {
    await login(page);
    await page.goto("/admin/categories");

    // 대분류 추가 — placeholder와 버튼 텍스트는 CategoryTree.tsx 기준.
    await page.getByPlaceholder("새 대분류명(예: 프린터)").fill(TOP);
    await page.getByRole("button", { name: "+ 대분류" }).click();

    // 대분류가 목록에 나타날 때까지 대기.
    await expect(page.getByText(TOP)).toBeVisible();

    // 방금 추가된 대분류 카드(li)를 찾아 소분류 추가.
    const card = page.locator("li", { hasText: TOP });
    await card.getByPlaceholder("새 소분류명").fill(SUB);
    // 소분류 추가 버튼은 텍스트 링크 스타일 button — exact match.
    await card.getByRole("button", { name: "+ 소분류" }).click();

    // 소분류는 "– {name}" 형태로 렌더링됨(CategoryTree TopNode children 렌더).
    await expect(page.getByText(`– ${SUB}`)).toBeVisible();
  });
});
