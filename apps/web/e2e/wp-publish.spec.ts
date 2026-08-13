import { test, expect, type Page } from "@playwright/test";

// #253 장비 → 홈페이지(워드프레스) 자동 등록 — 폼 체크박스·상세 패널 배지·분류 매핑 안내.
// 워커는 e2e에서 돌지 않으므로 잡은 queued로 남는다 → '동기화 중' 배지가 관찰 대상.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const EQ_MAPPED = "E2E_WP연동장비";
const EQ_UNMAPPED = "E2E_WP미매핑장비";
const EQ_INACTIVE = "E2E_WP비활성장비";
const CAT_MAPPED = "E2E_WP매핑분류";
const CAT_UNMAPPED = "E2E_WP미매핑분류";

// 로컬 Supabase 서비스롤 — 시드·정리용(비밀 아님, 공개 표준 데모 키).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

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

async function cleanup(): Promise<void> {
  for (const name of [EQ_MAPPED, EQ_UNMAPPED, EQ_INACTIVE]) {
    const res = await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(name)}&select=id`);
    const rows = (await res.json()) as { id: string }[];
    for (const r of rows) {
      await sr(`/rest/v1/jobs?payload->>equipment_id=eq.${r.id}`, { method: "DELETE" });
    }
    await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(name)}`, { method: "DELETE" });
  }
  for (const name of [CAT_MAPPED, CAT_UNMAPPED]) {
    await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("장비 → 홈페이지 자동 등록", () => {
  let mappedCatId = "";
  let unmappedCatId = "";
  let mappedEqId = "";
  let unmappedEqId = "";
  let inactiveEqId = "";

  test.beforeAll(async () => {
    await cleanup();
    const cat1 = await sr("/rest/v1/equipment_category", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: CAT_MAPPED, wp_category_id: 9 }),
    });
    mappedCatId = ((await cat1.json()) as { id: string }[])[0].id;
    const cat2 = await sr("/rest/v1/equipment_category", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: CAT_UNMAPPED }),
    });
    unmappedCatId = ((await cat2.json()) as { id: string }[])[0].id;

    const eq1 = await sr("/rest/v1/equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: EQ_MAPPED,
        model: "E2E-WP-1",
        base_price: 0,
        category_id: mappedCatId,
      }),
    });
    mappedEqId = ((await eq1.json()) as { id: string }[])[0].id;
    const eq2 = await sr("/rest/v1/equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: EQ_UNMAPPED,
        model: "E2E-WP-2",
        base_price: 0,
        category_id: unmappedCatId,
        wp_publish_enabled: true,
      }),
    });
    unmappedEqId = ((await eq2.json()) as { id: string }[])[0].id;
    // 비활성 + 체크 on: 트리거·워커가 조용히 건너뛰는 조합 — 패널이 사유를 안내해야 한다.
    const eq3 = await sr("/rest/v1/equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: EQ_INACTIVE,
        model: "E2E-WP-3",
        base_price: 0,
        category_id: mappedCatId,
        status: "inactive",
        wp_publish_enabled: true,
      }),
    });
    inactiveEqId = ((await eq3.json()) as { id: string }[])[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("#262 폼: 체크하면 부제·시리즈명 입력이 노출된다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/equipment/${unmappedEqId}/edit`);
    // 체크된 장비 — 슬롯 입력 2종 노출
    await expect(page.getByLabel("홈페이지 부제")).toBeVisible();
    await expect(page.getByLabel("영문 시리즈명")).toBeVisible();
  });

  test("#277 폼: 브랜드 선택 → 저장 → 재로드 시 값 유지", async ({ page }) => {
    await login(page);
    // 체크(enabled)된 장비에서만 브랜드 드롭다운이 노출된다 — unmappedEq가 enabled=true 시드.
    await page.goto(`/admin/equipment/${unmappedEqId}/edit`);
    const brand = page.getByLabel("홈페이지 브랜드");
    await expect(brand).toBeVisible();
    await brand.selectOption("ju");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.waitForURL(/\/admin\/equipment(\/|$)/, { timeout: 20_000 });
    await page.goto(`/admin/equipment/${unmappedEqId}/edit`);
    await expect(page.getByLabel("홈페이지 브랜드")).toHaveValue("ju");
  });

  test("#262 수동 편집 감지: 패널에 role=alert 안내 + 관리자 [그래도 덮어쓰기]", async ({
    page,
    browser,
  }) => {
    // 체크가 꺼져 있으면 어떤 에러든 not_linked로 눌린다 — 켜고, 켬 전환이 만든 자동 sync 잡은
    // 정리(activeJob이 있으면 syncing이 manual_edit보다 우선이라 배지가 가려짐).
    await sr(`/rest/v1/equipment?id=eq.${mappedEqId}`, {
      method: "PATCH",
      body: JSON.stringify({ wp_publish_enabled: true }),
    });
    await sr(`/rest/v1/jobs?type=eq.wp_publish&payload->>equipment_id=eq.${mappedEqId}`, {
      method: "DELETE",
    });
    // wp_last_error는 서버통제 — record_wp_sync RPC(service_role)로만 세팅 가능.
    await sr("/rest/v1/rpc/record_wp_sync", {
      method: "POST",
      body: JSON.stringify({
        p_equipment_id: mappedEqId,
        p_post_id: 900001,
        p_post_status: "draft",
        p_media: {},
        p_last_error: "manual_edit: WP에서 수동 편집된 글 — 갱신이 차단됩니다",
        p_clear_error: false,
        p_dirty_snapshot: null,
      }),
    });
    await login(page);
    await page.goto(`/admin/equipment/${mappedEqId}`);
    await expect(page.getByText("수동 편집됨").first()).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "직접 수정된 글" })).toBeVisible();
    await expect(page.getByRole("button", { name: "그래도 덮어쓰기" })).toBeVisible(); // admin = users.manage
    // 비관리자에게는 [그래도 덮어쓰기]가 보이지 않아야 한다(UI 노출 회귀 — 서버 가드는 db-tests가 커버).
    // admin 세션이 있는 page에서 /login은 리다이렉트되므로 별도 컨텍스트로 sales 로그인.
    const salesCtx = await browser.newContext();
    const salesPage = await salesCtx.newPage();
    await salesPage.goto("/login");
    await salesPage.getByLabel("이메일").fill("sales@jhtech.local");
    await salesPage.getByLabel("비밀번호", { exact: true }).fill("jhtech-sales-dev");
    await salesPage.getByRole("button", { name: "로그인" }).click();
    await salesPage.waitForURL(/\/admin\//, { timeout: 20_000 });
    await salesPage.goto(`/admin/equipment/${mappedEqId}`);
    await expect(salesPage.getByText("홈페이지").first()).toBeVisible();
    await expect(salesPage.getByRole("button", { name: "그래도 덮어쓰기" })).toHaveCount(0);
    await salesCtx.close();
    // 정리: 에러 클리어(후속 테스트의 '동기화 중' 단언 오염 방지)
    await sr("/rest/v1/rpc/record_wp_sync", {
      method: "POST",
      body: JSON.stringify({
        p_equipment_id: mappedEqId,
        p_post_id: null,
        p_post_status: null,
        p_media: null,
        p_last_error: null,
        p_clear_error: true,
        p_dirty_snapshot: null,
      }),
    });
  });

  test("장비 수정 폼: '홈페이지에 등록' 체크 → 캡션 노출 → 저장하면 상세 패널이 '동기화 중'", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/equipment/${mappedEqId}/edit`);
    const checkbox = page.getByLabel("홈페이지에 등록");
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(page.getByText("저장하면 홈페이지 초안에 자동 반영됩니다", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    // 홈페이지 등록이 켜진 저장은 목록이 아니라 상세로 — 홈페이지 패널(동기화 진행·미리보기)을 바로 보여준다.
    await page.waitForURL(new RegExp(`/admin/equipment/${mappedEqId}$`), { timeout: 20_000 });

    // 트리거가 sync 잡을 만들었고 워커가 없으므로 패널은 '동기화 중'
    await expect(page.getByText("동기화 중")).toBeVisible();
  });

  test("비활성 + 체크된 장비: 상세 패널에 '판매중으로 변경' 안내가 뜨고 동기화 버튼은 없다", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/admin/equipment/${inactiveEqId}`);
    await expect(
      page.getByText("비활성 장비는 홈페이지에 등록되지 않습니다", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "초안 동기화" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "홈페이지 발행" })).toHaveCount(0);
  });

  test("매핑 없는 분류의 체크된 장비: 폼 캡션·상세 패널 모두 '매핑 필요' 안내", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/equipment/${unmappedEqId}/edit`);
    await expect(
      page.getByText("분류의 WP 카테고리 설정 필요", { exact: false }),
    ).toBeVisible();

    await page.goto(`/admin/equipment/${unmappedEqId}`);
    // 헤더 미니 배지("WP 분류 매핑 필요")와 패널 배지("분류 매핑 필요")가 둘 다 매칭 — first로 단언.
    await expect(page.getByText("분류 매핑 필요").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "분류 설정으로 이동" })).toBeVisible();
  });

  test("분류 관리: WP 카테고리 드롭다운 또는 목록 실패 안내가 렌더된다", async ({ page }) => {
    await login(page);
    await page.goto("/admin/categories");
    // 외부(jhtech.co.kr) fetch 성공 여부에 따라 두 상태 중 하나 — 어느 쪽이든 UI 계약 충족.
    const dropdown = page.getByLabel(`${CAT_MAPPED} WP 카테고리`);
    const fallback = page.getByText("WP 카테고리 목록을 불러오지 못했습니다", { exact: false });
    await expect(dropdown.or(fallback).first()).toBeVisible({ timeout: 15_000 });
  });
});
