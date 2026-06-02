import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// 소모품 카탈로그 E2E — CRUD(taxonomy 분류+장비 scope) · 403 권한 차단
// taxonomy 기반으로 갱신(B6): 대분류+소분류 시드 → 대분류 공통 scope 선택 검증
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
// B6: 대분류·소분류 taxonomy 구조로 갱신
const E2E_TOP = "E2E대분류프린터";          // 대분류 — scope 선택 시 "E2E대분류프린터 공통"으로 표시
const E2E_SUB = "E2E소분류UV";              // 소분류 — 대분류의 자식 노드
const E2E_EQUIPMENT_NAME = "E2E장비-소모품용"; // 특정 장비 scope 검증용 장비(소분류 소속)
const CONS_NAME = "E2E소모품-테스트잉크";

// ── 서비스롤 REST fetch 헬퍼 ──────────────────────────────────────────────────
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

// beforeAll: E2E 전용 taxonomy(대분류→소분류) + 장비 시드.
// 역순 FK 정리 후 생성: 소모품 → 장비 → 소분류 → 대분류 삭제, 반대로 생성.
// 반환값: { topId, subId } — 필요 시 scope id 검증에 활용 가능.
async function resetAndSeed(): Promise<{ topId: string; subId: string }> {
  // 이전 실행 잔여 데이터 역순 FK 삭제
  // consumable_scope는 FK CASCADE이므로 consumables 먼저 삭제
  await sr(`/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  // 장비(소분류 소속) 삭제 전 consumables가 장비 FK를 참조할 경우 대비하여 이미 위에서 처리
  await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  // 소분류 → 대분류 순으로 삭제(parent_id FK)
  await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(E2E_SUB)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(E2E_TOP)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  // 대분류 생성 → 소분류(parent_id=대분류 id) 생성 → 장비(category_id=소분류 id) 생성
  const topRes = await sr(`/rest/v1/equipment_category`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: E2E_TOP }),
  });
  const top = (await topRes.json()) as Array<{ id: string }>;

  const subRes = await sr(`/rest/v1/equipment_category`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: E2E_SUB, parent_id: top[0].id }),
  });
  const sub = (await subRes.json()) as Array<{ id: string }>;

  // 소분류 소속 장비 생성 — 특정 장비 scope 검증에 필요
  await sr(`/rest/v1/equipment`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      name: E2E_EQUIPMENT_NAME,
      category_id: sub[0].id,
      base_price: 1000,
      status: "active",
    }),
  });

  return { topId: top[0].id, subId: sub[0].id };
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
// B6: scope1 = 대분류 공통(taxonomy node), scope2 = 특정 장비
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 1 — CRUD (taxonomy 분류·장비 scope 매핑)", () => {
  test.beforeAll(async () => {
    try {
      await resetAndSeed();
      console.log("소모품 E2E beforeAll 정리+시드 완료 (taxonomy 대분류·소분류·장비)");
    } catch (e) {
      // 로컬 Supabase 미가동 시 경고만
      console.warn("소모품 E2E cleanup 건너뜀 (로컬 Supabase 미가동):", e);
    }
  });

  test.afterAll(async () => {
    try {
      // 테스트 후 잔여 데이터 역순 FK 정리: 소모품 → 장비 → 소분류 → 대분류
      await sr(`/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(E2E_SUB)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(E2E_TOP)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      console.log("소모품 E2E afterAll 정리 완료");
    } catch (e) {
      console.warn("소모품 E2E afterAll cleanup 건너뜀:", e);
    }
  });

  // 1-1: 소모품 신규 생성 — 대분류 공통 scope + 특정 장비 scope 동시 추가
  test("1-1: 생성 → taxonomy 분류·장비 scope 매핑 → edit 페이지 리다이렉트", async ({
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

    // ── 범위1: 대분류 공통 scope ────────────────────────────────────────────
    // "+ 범위 추가" 클릭 → ScopeRow 1개 추가 (기본 mode="category")
    await page.getByRole("button", { name: "+ 범위 추가" }).click();

    // 분류 select — scopeSelectableOptions 결과:
    //   자식 있는 대분류 → optgroup(label="E2E대분류프린터") 안에
    //     option: "E2E대분류프린터 공통" (대분류 노드 id)
    //     option: "E2E소분류UV"         (소분류 노드 id)
    // "분류 선택…" placeholder가 포함된 첫 번째 select에서 "E2E대분류프린터 공통" 선택
    await page
      .locator("select")
      .filter({ hasText: "분류 선택…" })
      .first()
      .selectOption({ label: `${E2E_TOP} 공통` });

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

    // scope_summary 구성(queries.ts):
    //   labels = scopes.map(s => s.equipment_category?.name ?? s.equipment?.name)
    //   분류 scope: equipment_category.name = "E2E대분류프린터" (raw node name, "공통" 미포함)
    //   장비 scope: equipment.name = "E2E장비-소모품용"
    //   2개 scope → labels[0] + " 외 1건" = "E2E대분류프린터 외 1건" or "E2E장비-소모품용 외 1건"
    // DB 반환 순서에 무관하게 "외 1건" 포함 여부로 검증
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
