import { test, expect, type Page } from "@playwright/test";

// E5 UI Slice A — 견적 작성 폼 E2E.
// REST(service_role)로 의뢰 1건 시드 → admin 로그인 → 의뢰 상세 → 견적 작성(장비·옵션 입력) →
// 실시간 합계 확인 → 발행 → 의뢰 상세 견적 목록에 노출(발행 배지·금액).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const APP_BIZ = "8012345670";
const APP_CO = "E2E_견적작성사";

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
  // applications 삭제 시 quotes는 ON DELETE CASCADE로 함께 제거.
  await rest(`applications?biz_no=eq.${APP_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let appId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("E5 견적 작성 폼 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ company: APP_CO, biz_no: APP_BIZ, status: "new", fields: {} }]),
    });
    if (!res.ok) throw new Error(`application 시드 실패: ${res.status} ${await res.text()}`);
    appId = ((await res.json()) as Array<{ id: string }>)[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("의뢰→견적작성(장비·옵션·실시간합계)→발행→목록 노출", async ({ page }) => {
    await login(page);

    // 1) 의뢰 상세 → 견적 작성 버튼
    await page.goto(`/admin/applications/${appId}`);
    await expect(page.getByRole("link", { name: "견적 작성" })).toBeVisible();
    await page.getByRole("link", { name: "견적 작성" }).click();
    await page.waitForURL(/\/quote\/new$/, { timeout: 20_000 });

    // 2) 장비 줄 입력(기본 1줄)
    await page.getByLabel("장비 이름").fill("UV3300S");
    await page.getByLabel("장비 단가").fill("50000000");
    await page.getByLabel("장비 수량").fill("1");

    // 3) 옵션 추가 + 입력
    await page.getByRole("button", { name: "+ 옵션 추가" }).click();
    await page.getByLabel("옵션 이름").fill("프린트헤드");
    await page.getByLabel("옵션 단가").fill("2500000");
    await page.getByLabel("옵션 수량").fill("2");

    // 4) 실시간 합계: 공급가 55,000,000 · 합계 60,500,000
    await expect(page.getByText("55,000,000원")).toBeVisible();
    await expect(page.getByText("60,500,000원")).toBeVisible();

    // 5) 발행 → 의뢰 상세로 복귀
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(new RegExp(`/admin/applications/${appId}$`), { timeout: 20_000 });

    // 6) 견적 목록에 노출(발행 배지 + 채번 + 금액)
    await expect(page.getByText(/^JHQ-\d{8}-\d{3,}-V1$/)).toBeVisible();
    await expect(page.getByText("발행", { exact: true })).toBeVisible();
    await expect(page.getByText("60,500,000원")).toBeVisible();
  });
});
