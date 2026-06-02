import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// 소모품 카탈로그 E2E — CRUD(분류+장비 scope) · 403 권한 차단
// ──────────────────────────────────────────────────────────────────────────────

// 관리자 계정 (seed-admin.ts 기본값 — consumables.manage 포함)
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 영업 계정 — consumables.manage 없음, 403 확인용
// layout의 equipment.manage 가드에 막혀 "접근 권한이 없습니다" 렌더
const SALES_EMAIL = "sales@jhtech.local";
const SALES_PASSWORD = "jhtech-sales-dev";

// 로컬 Supabase 서비스롤 키 — 사전 데이터 준비 및 정리용.
// 표준 로컬 Supabase 데모 키(비밀 아님, 공개 표준값).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// E2E 전용 식별값 — 실제 데이터와 충돌 없도록 E2E 전용 prefix 사용
const E2E_CATEGORY = "E2E분류프린터";
const E2E_EQUIPMENT_NAME = "E2E장비-소모품용";
const CONS_NAME = "E2E소모품-테스트잉크";

// ── 서비스롤 REST fetch 헬퍼 ──────────────────────────────────────────────────
async function serviceRoleFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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

// beforeAll: E2E 전용 소모품·장비 정리 후 테스트용 장비 시드.
// 반환값: 생성된 장비 id(scope 행의 equipment_id로 활용).
async function resetAndSeed(): Promise<string> {
  // 이전 실행 잔여 소모품 삭제 (consumable_scope는 FK CASCADE)
  await serviceRoleFetch(
    `/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  // 이전 실행 잔여 테스트 장비 삭제
  await serviceRoleFetch(
    `/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );

  // 테스트용 장비 생성 — 특정 장비 scope 검증에 필요
  const res = await serviceRoleFetch(`/rest/v1/equipment`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: E2E_EQUIPMENT_NAME,
      category: E2E_CATEGORY,
      base_price: 1000,
      status: "active",
    }),
  });
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0].id;
}

// 로그인 헬퍼 — customers.spec.ts 패턴 미러
async function login(
  page: import("@playwright/test").Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 성공 → /admin/equipment 리다이렉트(모든 계정 공통 — admin layout 기본 경로)
  await page.waitForURL(/\/admin\/equipment/, { timeout: 20_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 1 — CRUD (생성 → scope 매핑 → 목록 확인 → 삭제)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 1 — CRUD (분류·장비 scope 매핑)", () => {
  test.beforeAll(async () => {
    try {
      await resetAndSeed();
      console.log("소모품 E2E beforeAll 정리+시드 완료");
    } catch (e) {
      // 로컬 Supabase 미가동 시 경고만
      console.warn("소모품 E2E cleanup 건너뜀 (로컬 Supabase 미가동):", e);
    }
  });

  test.afterAll(async () => {
    try {
      // 테스트 후 잔여 소모품·장비 정리
      await serviceRoleFetch(
        `/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      console.log("소모품 E2E afterAll 정리 완료");
    } catch (e) {
      console.warn("소모품 E2E afterAll cleanup 건너뜀:", e);
    }
  });

  // 1-1: 소모품 신규 생성 — 분류 scope + 특정 장비 scope 동시 추가
  test("1-1: 생성 → 분류·장비 scope 매핑 → edit 페이지 리다이렉트", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/consumables/new");

    // React hydration 완료 대기: 소모품명 input이 enabled 상태여야 인터랙션 가능.
    // ConsumableForm의 Field 컴포넌트: <label><span>소모품명 *</span><input /></label>
    const nameInput = page.getByLabel("소모품명 *");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });

    await nameInput.fill(CONS_NAME);

    // 단위 입력 — Field label "단위" (asterisk 없음)
    await page.getByLabel("단위").fill("병");

    // ── 범위1: 분류 scope ───────────────────────────────────────────────────
    // "+ 범위 추가" 클릭 → ScopeRow 1개 추가 (기본 mode="category")
    await page.getByRole("button", { name: "+ 범위 추가" }).click();

    // 분류 선택 select — placeholder option: "분류 선택…"
    // 첫 번째 분류 select에서 E2E_CATEGORY 선택
    await page
      .locator("select")
      .filter({ hasText: "분류 선택…" })
      .first()
      .selectOption(E2E_CATEGORY);

    // ── 범위2: 특정 장비 scope ─────────────────────────────────────────────
    // "+ 범위 추가" 클릭 → ScopeRow 2개째 추가
    await page.getByRole("button", { name: "+ 범위 추가" }).click();

    // ScopeRow li 목록에서 2번째 행 — aria-label="범위 행 삭제" 버튼을 포함한 li
    const scopeRows = page.locator("li", {
      has: page.locator('button[aria-label="범위 행 삭제"]'),
    });
    const secondRow = scopeRows.nth(1);

    // 2번째 행: "특정 장비" 토글 버튼 클릭 → mode 전환 → equipment select 렌더
    await secondRow
      .getByRole("button", { name: "특정 장비" })
      .click();

    // 장비 선택 select — placeholder option: "장비 선택…"
    // E2E_EQUIPMENT_NAME 장비 선택 (이름 완전일치 옵션)
    await secondRow
      .locator("select")
      .filter({ hasText: "장비 선택…" })
      .selectOption({ label: E2E_EQUIPMENT_NAME });

    // 저장 → createConsumable 액션 성공 → /admin/consumables/{id}/edit 리다이렉트
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForURL(/\/admin\/consumables\/[0-9a-f-]+\/edit$/, {
      timeout: 20_000,
    });
  });

  // 1-2: 목록 페이지에서 생성된 소모품과 scope 요약 확인
  test("1-2: 목록에서 소모품명·scope 요약 확인", async ({ page }) => {
    await login(page);
    await page.goto("/admin/consumables");

    // ConsumableTable: 소모품명 Link 렌더 — Link href="/admin/consumables/{id}/edit"
    await expect(
      page.getByRole("link", { name: CONS_NAME }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // scope_summary: labels[0](분류 먼저 추가) + " 외 1건" = "E2E분류프린터 외 1건"
    // queries.ts: labels = scopes.map(s => s.category ?? s.equipment?.name).filter(非null)
    // 분류 scope가 먼저 삽입됐으므로 labels[0] = E2E_CATEGORY.
    // ⚠️ DB 반환 순서가 달라 장비명이 첫 label로 올 경우 regex로 포용 — 핵심은 "외 1건" 포함.
    await expect(
      page.getByText(/외 1건/),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 1-3: edit 페이지에서 삭제 → 목록으로 리다이렉트 → 소모품 사라짐
  test("1-3: 삭제 → 목록에서 사라짐", async ({ page }) => {
    await login(page);
    await page.goto("/admin/consumables");

    // 소모품명 링크 클릭 → edit 페이지
    await page
      .getByRole("link", { name: CONS_NAME })
      .first()
      .click();
    await page.waitForURL(/\/admin\/consumables\/[0-9a-f-]+\/edit$/, {
      timeout: 15_000,
    });

    // 삭제 confirm 다이얼로그 — page.once("dialog")로 자동 accept (한 번만 등록, 핸들러 누수 방지)
    page.once("dialog", (dialog) => dialog.accept());

    // 삭제 버튼 클릭 — exact: true로 다른 버튼(저장·취소)과 구분
    await page.getByRole("button", { name: "삭제", exact: true }).click();

    // 삭제 성공 → /admin/consumables 목록으로 리다이렉트
    await page.waitForURL(/\/admin\/consumables$/, { timeout: 20_000 });

    // 삭제된 소모품이 목록에 없어야 함
    await expect(
      page.getByRole("link", { name: CONS_NAME }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 2 — 403 (consumables.manage 없는 사용자 접근 차단)
// sales@jhtech.local: permissions = [applications.view_all, quotes.write, email.send]
// consumables.manage 없으므로 admin layout의 equipment.manage 가드에 막힘
// → /admin/consumables → "접근 권한이 없습니다"
// ──────────────────────────────────────────────────────────────────────────────
test.describe("시나리오 2 — 403 (consumables.manage 없는 사용자)", () => {
  test("2-1: 영업 계정 → /admin/consumables 접근 시 권한 차단 메시지", async ({
    page,
  }) => {
    // sales@jhtech.local 로그인 — consumables.manage 미포함(seed-admin.ts 확인)
    // 로그인 후 admin layout이 equipment.manage 가드 → 리다이렉트 목적지를 확인
    await page.goto("/login");
    await page.getByLabel("이메일").fill(SALES_EMAIL);
    await page.getByLabel("비밀번호").fill(SALES_PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();

    // 영업 계정 로그인 후 어디로 가든 대기 (기본 /admin/equipment 또는 forbidden)
    await page.waitForURL(/\/admin\//, { timeout: 20_000 });

    // /admin/consumables 직접 접근
    await page.goto("/admin/consumables");

    // page.ts Forbidden 컴포넌트: <p>접근 권한이 없습니다</p>
    await expect(
      page.getByText("접근 권한이 없습니다"),
    ).toBeVisible({ timeout: 15_000 });
  });
});
