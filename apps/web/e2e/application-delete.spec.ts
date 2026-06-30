import { test, expect, type Page } from "@playwright/test";

// 의뢰 삭제 E2E — 관리자가 의뢰 상세에서 '의뢰 삭제' → 확인 → 목록으로 복귀 + 의뢰 사라짐.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const BIZ = "8012345672";
const CO = "E2E_의뢰삭제사";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: LOCAL_SERVICE_ROLE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("의뢰 삭제 E2E", () => {
  let appId: string;
  test.beforeAll(async () => {
    await rest(`applications?biz_no=eq.${BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ company: CO, biz_no: BIZ, status: "new", fields: {} }]),
    });
    if (!res.ok) throw new Error(`시드 실패: ${res.status} ${await res.text()}`);
    appId = ((await res.json()) as Array<{ id: string }>)[0].id;
  });
  test.afterAll(async () => {
    await rest(`applications?biz_no=eq.${BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  });

  test("관리자: 의뢰 상세 → 의뢰 삭제 → 목록 복귀 + 사라짐", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/applications/${appId}`);
    // 확인창 자동 수락
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "의뢰 삭제" }).click();
    // 삭제 성공 → 목록으로 redirect
    await page.waitForURL(/\/admin\/applications$/, { timeout: 20_000 });
    // 의뢰 상세 재진입 시 '찾을 수 없음'(삭제됨)
    await page.goto(`/admin/applications/${appId}`);
    await expect(page.getByText("신청을 찾을 수 없습니다.")).toBeVisible({ timeout: 15_000 });
  });
});
