import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// 고객 마스터 E2E — CRUD(직접입력) · 견적 가져오기 dedup · 403 권한 차단
// ──────────────────────────────────────────────────────────────────────────────

// 관리자 계정 (seed-admin.ts 기본값)
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 영업 계정 — customers.manage 없음, 403 확인용 (seed-admin.ts에서 시드됨)
const SALES_EMAIL = "sales@jhtech.local";
const SALES_PASSWORD = "jhtech-sales-dev";

// 로컬 Supabase 서비스롤 — 이전 실행 잔여 E2E 데이터 정리용.
// 표준 로컬 Supabase 데모 키 (비밀 아님, 공개 표준 값).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// E2E 전용 업체명·사업자번호 — 체크섬 검증 통과 확인값.
// validateBizNo('1234567891') = true  (CRUD 시나리오)
// validateBizNo('2208162517') = true  (Import 시나리오)
const CRUD_COMPANY_NAME = "E2E고객사";
const CRUD_BIZ_NO = "1234567891"; // 체크섬 유효 (가중치 알고리즘 검증 완료)

const IMPORT_COMPANY_NAME = "E2E수입사";
const IMPORT_BIZ_NO = "2208162517"; // 체크섬 유효 (가중치 알고리즘 검증 완료)

// 서비스롤 REST fetch 헬퍼
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

// beforeAll: 이전 실행 잔여 E2E 데이터를 정리해 strict mode 충돌 방지.
// biz_no 기준 AND 업체명 prefix 기준 모두 삭제.
test.beforeAll(async () => {
  try {
    // company_equipment는 companies ON DELETE CASCADE이므로 companies 먼저 삭제하면 연쇄 처리됨.
    // 단, FK 제약이 없는 경우를 위해 biz_no 기준으로 company_equipment도 명시 정리.

    // CRUD용 회사 삭제
    await serviceRoleFetch(
      `/rest/v1/companies?biz_no=eq.${CRUD_BIZ_NO}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await serviceRoleFetch(
      `/rest/v1/companies?name=like.${encodeURIComponent("E2E고객%")}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );

    // Import용 회사 및 견적신청 삭제
    await serviceRoleFetch(
      `/rest/v1/companies?biz_no=eq.${IMPORT_BIZ_NO}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await serviceRoleFetch(
      `/rest/v1/companies?name=like.${encodeURIComponent("E2E수입%")}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await serviceRoleFetch(
      `/rest/v1/applications?company=eq.${encodeURIComponent(IMPORT_COMPANY_NAME)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await serviceRoleFetch(
      `/rest/v1/applications?biz_no=eq.${IMPORT_BIZ_NO}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );

    console.log("E2E beforeAll 정리 완료");
  } catch (e) {
    // 로컬 Supabase가 꺼져 있거나 E2E 환경이 아닌 경우 경고만
    console.warn("E2E cleanup 건너뜀 (로컬 Supabase 미가동):", e);
  }
});

// 로그인 헬퍼 — equipment.spec.ts 패턴 미러 (이메일/비밀번호 파라미터화)
async function login(
  page: import("@playwright/test").Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 성공 → /admin/equipment 목록으로 리다이렉트 (모든 계정 공통)
  await page.waitForURL(/\/admin\/equipment/, { timeout: 20_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 1: CRUD (직접 입력 → 목록 확인 → 삭제)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 1 — CRUD (직접입력)", () => {
  // 생성: /admin/customers/new?mode=direct → CompanyForm → 저장 → edit 리다이렉트
  test("1-1: 직접입력 생성 → edit 페이지로 리다이렉트", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers/new?mode=direct");

    // React hydration 완료 대기: 업체명 input이 enabled 상태여야 인터랙션 가능
    const nameInput = page.getByLabel("업체명 *");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });

    await nameInput.fill(CRUD_COMPANY_NAME);
    await page.getByLabel("사업자등록번호").fill(CRUD_BIZ_NO);

    // 보유장비 추가: 직접입력 모드(기본값)에서 장비명 입력
    await page.getByRole("button", { name: "+ 장비 추가" }).click();
    // 행 렌더 완료 대기
    await expect(page.getByPlaceholder("장비명 직접 입력")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("장비명 직접 입력").fill("단종프레스");

    // 저장
    await page.getByRole("button", { name: "저장" }).click();

    // 저장 성공 → /admin/customers/{uuid}/edit 으로 리다이렉트
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+\/edit$/, {
      timeout: 20_000,
    });
  });

  // 목록 확인: /admin/customers에서 업체명 링크 노출
  test("1-2: 목록에서 생성된 고객 확인", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers");

    // 최소 1건 이상 목록에 노출되면 통과 (복수 레코드에도 안전)
    await expect(
      page.getByRole("link", { name: CRUD_COMPANY_NAME }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // 삭제: edit 페이지에서 삭제 버튼 클릭 → confirm 다이얼로그 accept → 목록으로 리다이렉트
  test("1-3: 삭제 → 목록에서 사라짐", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers");

    // 업체명 링크 클릭 → edit 페이지
    await page.getByRole("link", { name: CRUD_COMPANY_NAME }).first().click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+\/edit$/, {
      timeout: 15_000,
    });

    // 삭제 confirm 다이얼로그 — page.on("dialog")로 자동 accept
    page.on("dialog", (dialog) => dialog.accept());

    // 삭제 버튼 클릭 — exact: true로 장비 행 삭제(✕) 버튼과 구분
    await page.getByRole("button", { name: "삭제", exact: true }).click();

    // 삭제 성공 → /admin/customers 목록으로 리다이렉트
    await page.waitForURL(/\/admin\/customers$/, { timeout: 20_000 });

    // 삭제된 업체가 목록에 없어야 함
    await expect(
      page.getByRole("link", { name: CRUD_COMPANY_NAME }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 2: 견적 가져오기(Import) + dedup (이미 등록된 사업자번호)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 2 — 견적 가져오기 + dedup", () => {
  // 테스트 전제: 서비스롤 REST로 applications 레코드 직접 삽입.
  // seq_no는 BEFORE INSERT 트리거가 자동 생성하므로 클라이언트에서 전달 불필요.
  test.beforeAll(async () => {
    try {
      // 이전 실행 잔여 정리 (중복 실행 멱등성)
      await serviceRoleFetch(
        `/rest/v1/applications?company=eq.${encodeURIComponent(IMPORT_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/companies?biz_no=eq.${IMPORT_BIZ_NO}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );

      // 견적신청 생성 — company·biz_no·status만 지정, seq_no는 트리거 자동 채번
      const res = await serviceRoleFetch("/rest/v1/applications", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          company: IMPORT_COMPANY_NAME,
          biz_no: IMPORT_BIZ_NO,
          status: "new",
        }),
      });
      if (!res.ok) {
        console.warn(
          "Import 시나리오 견적신청 생성 실패:",
          res.status,
          await res.text(),
        );
      } else {
        console.log("Import 시나리오 견적신청 생성 완료");
      }
    } catch (e) {
      console.warn("Import 시나리오 setup 건너뜀:", e);
    }
  });

  // afterAll: Import 시나리오가 만든 회사·견적신청 정리
  test.afterAll(async () => {
    try {
      await serviceRoleFetch(
        `/rest/v1/companies?biz_no=eq.${IMPORT_BIZ_NO}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/applications?company=eq.${encodeURIComponent(IMPORT_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    } catch (e) {
      console.warn("Import 시나리오 cleanup 건너뜀:", e);
    }
  });

  // 첫 번째 Import: 새 고객 등록 → "새 고객으로 등록했습니다" 배너
  test("2-1: 견적 가져오기 → 새 고객 등록 배너", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers/new?mode=import");

    // ApplicationPicker: 검색 input placeholder로 위치 파악
    const searchInput = page.getByPlaceholder("업체명·사업자번호·접수번호로 검색");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // 2자 이상 입력 시 검색 트리거 — 업체명으로 검색
    await searchInput.fill(IMPORT_COMPANY_NAME);

    // 검색 결과 로딩 대기 — 결과 행의 "선택" 버튼 노출 확인
    await expect(
      page.getByRole("button", { name: "선택" }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 결과 행 선택
    await page.getByRole("button", { name: "선택" }).first().click();

    // 등록 완료 → /admin/customers/{uuid}/edit?registered=new 리다이렉트
    await page.waitForURL(
      /\/admin\/customers\/[0-9a-f-]+\/edit\?registered=new/,
      { timeout: 20_000 },
    );

    // 새 고객 배너 노출 확인
    await expect(
      page.getByText("새 고객으로 등록했습니다"),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 두 번째 Import (dedup): 동일 사업자번호 → "이미 등록된 고객입니다" 배너
  test("2-2: 동일 사업자번호 재가져오기 → 기존 고객 배너(dedup)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/customers/new?mode=import");

    const searchInput = page.getByPlaceholder("업체명·사업자번호·접수번호로 검색");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    // 같은 업체명으로 재검색
    await searchInput.fill(IMPORT_COMPANY_NAME);

    // 검색 결과 "선택" 버튼 대기
    await expect(
      page.getByRole("button", { name: "선택" }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "선택" }).first().click();

    // 기존 고객(dedup) → /admin/customers/{uuid}/edit?registered=existing 리다이렉트
    await page.waitForURL(
      /\/admin\/customers\/[0-9a-f-]+\/edit\?registered=existing/,
      { timeout: 20_000 },
    );

    // "이미 등록된 고객입니다" 배너 포함 텍스트 노출 확인
    await expect(
      page.getByText("이미 등록된 고객입니다", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 3: 403 — customers.manage 없는 사용자의 접근 차단
// seed-admin.ts에서 시드된 sales@jhtech.local (permissions: applications.view_all, quotes.write, email.send)
// customers.manage 없으므로 /admin/customers 접근 시 "접근 권한이 없습니다" 렌더
// ──────────────────────────────────────────────────────────────────────────────
test.describe("시나리오 3 — 403 (customers.manage 없는 사용자)", () => {
  test("3-1: 영업 계정 → /admin/customers 접근 시 권한 차단 메시지", async ({
    page,
  }) => {
    // sales@jhtech.local 로그인 — customers.manage 미포함 (seed-admin.ts 확인 완료)
    await login(page, SALES_EMAIL, SALES_PASSWORD);

    // /admin/customers 직접 접근
    await page.goto("/admin/customers");

    // 서버 렌더 완료 대기 후 forbidden 패널 확인
    await expect(
      page.getByText("접근 권한이 없습니다"),
    ).toBeVisible({ timeout: 15_000 });
  });
});
