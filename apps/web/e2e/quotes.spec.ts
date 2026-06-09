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

    // 3) 추가 옵션 입력(카탈로그 미선택 = 직접입력 경로, 포함옵션 섹션 없음)
    await page.getByRole("button", { name: "+ 추가 옵션" }).click();
    await page.getByLabel("추가 옵션 이름").fill("프린트헤드");
    await page.getByLabel("추가 옵션 단가").fill("2500000");
    await page.getByLabel("추가 옵션 수량").fill("2");

    // 4) 실시간 합계: 공급가 55,000,000 · 합계 60,500,000
    await expect(page.getByText("55,000,000원")).toBeVisible();
    await expect(page.getByText("60,500,000원")).toBeVisible();

    // 5) 발행 → 의뢰 상세로 복귀
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(new RegExp(`/admin/applications/${appId}$`), { timeout: 20_000 });

    // 6) 견적 목록에 노출(발행 배지 + 채번 + 금액) + 의뢰 상태 = 견적발송
    // 견적번호·발행 배지·합계가 히어로/버전이력/요약패널 여러 곳에 노출 → first().
    await expect(page.getByText(/^JHQ-\d{8}-\d{3,}-V1$/).first()).toBeVisible();
    await expect(page.getByText("발행", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("60,500,000원").first()).toBeVisible();
    await expect(page.getByTestId("app-status")).toHaveText("견적발송"); // 발행 → 의뢰 상태 자동 전이
  });
});

const MANUAL_CO = "E2E_수기견적사";

test.describe.serial("E5 수기 견적 E2E", () => {
  test.beforeAll(async () => {
    await rest(`applications?company=eq.${encodeURIComponent(MANUAL_CO)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
  });
  test.afterAll(async () => {
    await rest(`applications?company=eq.${encodeURIComponent(MANUAL_CO)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
  });

  test("목록→수기 견적작성(회사명+장비)→발행→새 의뢰 상세에 견적 노출", async ({ page }) => {
    await login(page);

    // 1) 목록 → 수기 견적 작성
    await page.goto("/admin/applications");
    await page.getByRole("link", { name: "수기 견적" }).click();
    await page.waitForURL(/\/admin\/quotes\/new$/, { timeout: 20_000 });

    // 2) 회사명 + 장비
    await page.getByLabel("회사명").fill(MANUAL_CO);
    await page.getByLabel("장비 이름").fill("UV5000");
    await page.getByLabel("장비 단가").fill("30000000");
    await page.getByLabel("장비 수량").fill("1");
    await expect(page.getByText("33,000,000원")).toBeVisible(); // 합계(공급 30M + 세 3M)

    // 3) 발행 → 새로 생긴 의뢰 상세로 이동
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(/\/admin\/applications\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    // 4) 새 의뢰 상세 = 회사명 + 견적(발행) 노출
    await expect(page.getByText(MANUAL_CO).first()).toBeVisible();
    // 견적번호·발행 배지·합계가 히어로/버전이력/요약패널 여러 곳에 노출 → first().
    await expect(page.getByText(/^JHQ-\d{8}-\d{3,}-V1$/).first()).toBeVisible();
    await expect(page.getByText("발행", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("33,000,000원").first()).toBeVisible();
    await expect(page.getByTestId("app-status")).toHaveText("견적발송"); // 수기 발행 → 견적발송
  });
});

const RE_BIZ = "8012345671";
const RE_CO = "E2E_재발행사";

test.describe.serial("E5 견적 상세+재발행 E2E", () => {
  let reAppId: string;
  test.beforeAll(async () => {
    await rest(`applications?biz_no=eq.${RE_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ company: RE_CO, biz_no: RE_BIZ, status: "new", fields: {} }]),
    });
    if (!res.ok) throw new Error(`시드 실패: ${res.status} ${await res.text()}`);
    reAppId = ((await res.json()) as Array<{ id: string }>)[0].id;
  });
  test.afterAll(async () => {
    await rest(`applications?biz_no=eq.${RE_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  });

  test("견적작성(V1)→상세 내역→재발행(프리필·수정)→V2(번호 유지)", async ({ page }) => {
    await login(page);

    // V1 발행
    await page.goto(`/admin/applications/${reAppId}/quote/new`);
    await page.getByLabel("장비 이름").fill("UV3300S");
    await page.getByLabel("장비 단가").fill("50000000");
    await page.getByLabel("장비 수량").fill("1");
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(new RegExp(`/admin/applications/${reAppId}$`), { timeout: 20_000 });

    // V1 내역이 의뢰 상세 프레임에 인라인 노출(선택장비·합계). 별도 견적 페이지 없음(?v= 통합).
    await expect(page.getByText("UV3300S").first()).toBeVisible(); // 선택 장비
    await expect(page.getByText("55,000,000원").first()).toBeVisible(); // 합계(공급 50M+세 5M)

    // 재발행 = 요약패널 [수정] 링크 → quote/new?from= 프리필
    await page.getByRole("link", { name: "수정" }).first().click();
    await page.waitForURL(/\/quote\/new\?from=/, { timeout: 20_000 });
    // 프리필 확인 — 단가는 직접입력/카탈로그선택 모드 무관하게 채워짐(장비명은 모드별로 input/select라 단가로 검증).
    await expect(page.getByLabel("장비 단가")).toHaveValue("50000000");

    // 수정(수량 2) 후 발행 → V2
    await page.getByLabel("장비 수량").fill("2");
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(new RegExp(`/admin/applications/${reAppId}$`), { timeout: 20_000 });

    // 버전 이력 표에 V2 + V1 둘 다(번호 유지·버전 증가). 채번은 여러 곳 노출 → first().
    await expect(page.getByText(/^JHQ-\d{8}-\d{3,}-V2$/).first()).toBeVisible();
    await expect(page.getByText(/^JHQ-\d{8}-\d{3,}-V1$/).first()).toBeVisible();
    await expect(page.getByText("110,000,000원").first()).toBeVisible(); // V2 합계(공급 100M+세 10M)
  });
});
