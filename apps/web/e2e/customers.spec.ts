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
// validateBizNo('3000000007') = true  (diff-upsert id 보존 시나리오)
const CRUD_COMPANY_NAME = "E2E고객사";
const CRUD_BIZ_NO = "1234567891"; // 체크섬 유효 (가중치 알고리즘 검증 완료)

const IMPORT_COMPANY_NAME = "E2E수입사";
const IMPORT_BIZ_NO = "2208162517"; // 체크섬 유효 (가중치 알고리즘 검증 완료)

// 시나리오 4 전용 — 기존 시나리오와 biz_no 충돌 없는 독립 레코드
const DIFF_COMPANY_NAME = "E2E보존사";
const DIFF_BIZ_NO = "3000000007"; // 체크섬 유효 (가중치 알고리즘 검증 완료)

// 시나리오 5(P-F 통합 고객이력) 전용 — 견적·AS·소모품 시드용 독립 레코드
const PF_COMPANY_NAME = "E2E이력사";
const PF_BIZ_NO = "5500001234"; // 10자리(직접 REST 삽입이라 체크섬 무관)

// 시나리오 6(Task 7 — 고객 필수 강화) 전용 — 다른 시나리오와 겹치지 않는 독립 값
const DUP_LIVE_COMPANY_NAME = "E2E중복원본사"; // 실시간 중복 경고 테스트에서 먼저 등록되는 회사
const DUP_LIVE_BIZ_NO = "1000047514"; // 체크섬 유효(가중치 알고리즘 검증 완료)
const NO_BIZNO_COMPANY_NAME = "E2E개인고객"; // '사업자번호 없음' 예외 등록 성공 테스트

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

    // 시나리오 4(diff-upsert id 보존)용 회사 삭제 — company_equipment는 CASCADE로 함께 삭제
    await serviceRoleFetch(
      `/rest/v1/companies?biz_no=eq.${DIFF_BIZ_NO}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await serviceRoleFetch(
      `/rest/v1/companies?name=like.${encodeURIComponent("E2E보존%")}`,
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
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
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
    // 필수 강화(대표자·주소·연락처 최소1) — 채우지 않으면 저장이 client validation에 막힌다.
    await page.getByLabel("대표자").fill("김대표");
    await page.getByRole("textbox", { name: "본사주소" }).fill("서울시 강남구 테스트로 1");
    await page.getByLabel("휴대폰").fill("010-1111-2222");

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

    // 업체명 링크 클릭 → 상세 뷰(P-F) → [수정] → edit 페이지
    await page.getByRole("link", { name: CRUD_COMPANY_NAME }).first().click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+$/, { timeout: 15_000 });
    await page.getByRole("link", { name: "수정" }).click();
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
// 시나리오 3: E5a — 영업담당은 customers.edit 보유 → /admin/customers 접근 가능(본인 스코프).
// (구버전: customers.manage 없어 403. E5a에서 SALES_PRESET에 customers.edit 포함 → 접근 허용,
//  RLS가 본인 담당 고객으로 행 스코프.)
// ──────────────────────────────────────────────────────────────────────────────
test.describe("시나리오 3 — 영업담당 고객 접근(본인 스코프)", () => {
  test("3-1: 영업 계정 → /admin/customers 접근 가능(forbidden 아님)", async ({
    page,
  }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto("/admin/customers");

    // forbidden 패널이 아니라 고객 목록 페이지가 렌더된다(본인 담당 스코프).
    await expect(page.getByText("접근 권한이 없습니다")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "고객" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 4: 편집 시 보유장비 id 보존 (diff-upsert 회귀가드)
// 핵심 안티버그: 편집 저장은 기존 company_equipment 행을 UPDATE해야 함.
// delete-all-then-insert 방식으로 구현하면 id가 바뀌어 P-D A/S 이력 FK가 깨진다.
// 이 테스트는 저장 전후로 동일 row id가 유지되는지를 서비스롤 REST로 직접 검증한다.
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 4 — 편집 시 보유장비 id 보존(diff-upsert)", () => {
  // 테스트 간 공유 상태 — 생성된 회사 id와 장비 행 id를 시리얼 단계 간 전달
  let companyId: string;
  let originalEquipmentId: string;

  // afterAll: 시나리오 4가 만든 회사·장비 정리 (company_equipment는 CASCADE)
  test.afterAll(async () => {
    try {
      await serviceRoleFetch(
        `/rest/v1/companies?biz_no=eq.${DIFF_BIZ_NO}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    } catch (e) {
      console.warn("시나리오 4 cleanup 건너뜀:", e);
    }
  });

  // 4-1: 직접입력 모드로 신규 고객 생성 — 장비 행 1개(label=보존프레스) 포함
  test("4-1: 직접입력 생성 → edit 페이지 리다이렉트", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers/new?mode=direct");

    // React hydration 완료 대기
    const nameInput = page.getByLabel("업체명 *");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });

    await nameInput.fill(DIFF_COMPANY_NAME);
    await page.getByLabel("사업자등록번호").fill(DIFF_BIZ_NO);
    // 필수 강화(대표자·주소·연락처 최소1) — 채우지 않으면 저장이 client validation에 막힌다.
    await page.getByLabel("대표자").fill("이대표");
    await page.getByRole("textbox", { name: "본사주소" }).fill("서울시 마포구 테스트로 2");
    await page.getByLabel("휴대폰").fill("010-3333-4444");

    // 보유장비 1행 추가 — 직접입력 모드(기본)로 장비명 입력
    await page.getByRole("button", { name: "+ 장비 추가" }).click();
    await expect(page.getByPlaceholder("장비명 직접 입력")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("장비명 직접 입력").fill("보존프레스");

    // 저장 → /admin/customers/{uuid}/edit 리다이렉트
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+\/edit$/, {
      timeout: 20_000,
    });

    // URL에서 company id 추출 — 이후 단계에서 REST 쿼리에 사용
    const url = page.url();
    const match = url.match(/\/admin\/customers\/([0-9a-f-]+)\/edit$/);
    if (!match) throw new Error(`edit 페이지 URL에서 company id 추출 실패: ${url}`);
    companyId = match[1];
  });

  // 4-2: 서비스롤 REST로 company_equipment 행 id 캡처 (ORIGINAL_ID)
  test("4-2: 서비스롤 REST로 원래 장비 행 id 확인", async () => {
    // company id는 4-1에서 설정됨 — serial 블록이라 순서 보장
    expect(companyId).toBeTruthy();

    const res = await serviceRoleFetch(
      `/rest/v1/company_equipment?company_id=eq.${companyId}&select=id,label`,
    );
    expect(res.ok).toBe(true);

    const rows = (await res.json()) as { id: string; label: string }[];
    // 정확히 1행 존재 확인 — 생성 시 장비 1개 추가
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("보존프레스");

    // 원래 id 저장 — 4-4 검증에서 동일성 비교에 사용
    originalEquipmentId = rows[0].id;
    expect(originalEquipmentId).toBeTruthy();
  });

  // 4-3: edit 페이지에서 일련번호(serial_no)만 변경 후 저장
  // label은 그대로 두어 같은 행을 UPDATE하도록 유도 — id 변경 유발 조건 재현
  test("4-3: edit 페이지에서 일련번호 변경 → 저장", async ({ page }) => {
    expect(companyId).toBeTruthy();

    await login(page);
    // edit 페이지로 직접 이동 (URL 알고 있으므로 목록 경유 불필요)
    await page.goto(`/admin/customers/${companyId}/edit`);

    // 폼 로드 완료 대기 — 업체명 필드가 기존 값으로 채워져 있어야 함
    await expect(page.getByLabel("업체명 *")).toHaveValue(DIFF_COMPANY_NAME, {
      timeout: 15_000,
    });

    // 일련번호 input에 값 입력 — placeholder="일련번호" (CompanyEquipmentEditor.tsx 확인)
    // 기존 label·equipment_id는 건드리지 않음(같은 행 UPDATE 경로 유지)
    await page.getByPlaceholder("일련번호").fill("SN-EDIT-1");

    // 저장 → updateCustomer 액션 성공 시 고객 상세로 리다이렉트(수정 폼 개편)
    await page.getByRole("button", { name: "변경사항 저장" }).click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+$/, { timeout: 20_000 });
  });

  // 4-4: 저장 후 company_equipment 재조회 — id 보존 + serial_no 반영 확인
  // 이것이 핵심 단언: delete+insert 방식이면 id가 바뀌어 실패함
  test("4-4: 저장 후 장비 row id 보존 확인 (diff-upsert 핵심 단언)", async () => {
    expect(companyId).toBeTruthy();
    expect(originalEquipmentId).toBeTruthy();

    const res = await serviceRoleFetch(
      `/rest/v1/company_equipment?company_id=eq.${companyId}&select=id,serial_no`,
    );
    expect(res.ok).toBe(true);

    const rows = (await res.json()) as { id: string; serial_no: string | null }[];

    // (a) 정확히 1행 — 삭제·추가 없이 기존 행만 UPDATE됐어야 함
    expect(rows).toHaveLength(1);

    // (b) id 동일성 — UPDATE면 같고, delete+insert면 다름 → 이 단언이 anti-bug 핵심
    expect(rows[0].id).toBe(originalEquipmentId);

    // (c) serial_no 반영 — 편집 내용이 실제로 저장됐는지 확인
    expect(rows[0].serial_no).toBe("SN-EDIT-1");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 5: P-F 통합 고객이력 — 견적/구입/AS/소모품 4섹션 + 완료 카운트 + AS 딥링크
// 핵심: customers.manage 보유자가 담당자 무관 전체 이력을 본다(DEFINER RPC get_company_request_history).
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 5 — 통합 고객이력(P-F)", () => {
  let companyId: string;
  let serviceSeqNo: string;
  let serviceId: string;

  test.beforeAll(async () => {
    try {
      // 잔여 정리(멱등)
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.${PF_BIZ_NO}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(
        `/rest/v1/applications?company=eq.${encodeURIComponent(PF_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );

      // 업체
      const coRes = await serviceRoleFetch("/rest/v1/companies", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: PF_COMPANY_NAME, biz_no: PF_BIZ_NO }),
      });
      companyId = ((await coRes.json()) as { id: string }[])[0].id;

      // 견적(applications) — 하이픈 biz_no로 정규화 매칭 검증
      await serviceRoleFetch("/rest/v1/applications", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ company: PF_COMPANY_NAME, biz_no: "550-00-01234", status: "new" }),
      });

      // AS(service_requests) — status=done(완료 카운트 검증), 딥링크 대상
      const srRes = await serviceRoleFetch("/rest/v1/service_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          biz_no: PF_BIZ_NO,
          company_id: companyId,
          contact_company: PF_COMPANY_NAME,
          status: "done",
          privacy_consent: true,
          privacy_consent_at: new Date().toISOString(),
          privacy_consent_version: "v1.0",
        }),
      });
      const sr = ((await srRes.json()) as { id: string; seq_no: string }[])[0];
      serviceId = sr.id;
      serviceSeqNo = sr.seq_no;

      // 소모품(supply_requests + item)
      const conRes = await serviceRoleFetch("/rest/v1/consumables", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: "E2E이력잉크", unit: "개" }),
      });
      const consumableId = ((await conRes.json()) as { id: string }[])[0].id;
      const supRes = await serviceRoleFetch("/rest/v1/supply_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: companyId,
          requester_name: "담당",
          requester_phone: "010",
          privacy_consent: true,
          privacy_consent_at: new Date().toISOString(),
          privacy_consent_version: "v1.0",
        }),
      });
      const supId = ((await supRes.json()) as { id: string }[])[0].id;
      await serviceRoleFetch("/rest/v1/supply_request_items", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          request_id: supId,
          consumable_id: consumableId,
          consumable_name_snapshot: "E2E이력잉크",
          qty: 2,
        }),
      });
      console.log("시나리오 5 시드 완료", companyId, serviceSeqNo);
    } catch (e) {
      console.warn("시나리오 5 setup 건너뜀:", e);
    }
  });

  test.afterAll(async () => {
    try {
      // service_requests·supply_requests는 company_id FK(no cascade) → companies보다 먼저 삭제해야 함.
      // (안 지우면 잔여행이 db-tests 전역 카운트 단언을 깨뜨린다 — CLAUDE.md 게이트 주의)
      if (companyId) {
        await serviceRoleFetch(
          `/rest/v1/service_requests?company_id=eq.${companyId}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } },
        );
        await serviceRoleFetch(
          `/rest/v1/supply_requests?company_id=eq.${companyId}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } },
        );
      }
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.${PF_BIZ_NO}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(
        `/rest/v1/applications?company=eq.${encodeURIComponent(PF_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/consumables?name=eq.${encodeURIComponent("E2E이력잉크")}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    } catch (e) {
      console.warn("시나리오 5 cleanup 건너뜀:", e);
    }
  });

  // 5-1: admin → 상세에서 4섹션·완료 카운트·AS 딥링크
  test("5-1: 통합 이력 4섹션 표시 + AS 행 → 상세 이동", async ({ page }) => {
    expect(companyId).toBeTruthy();
    await login(page);
    await page.goto(`/admin/customers/${companyId}`);

    // 헤더(업체명) + 거래 활동 4탭(CRM 레이아웃 개편 — 섹션→탭)
    await expect(page.getByRole("heading", { name: PF_COMPANY_NAME })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: /^견적/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^보유장비/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^A\/S/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^소모품/ })).toBeVisible();

    // A/S 탭 전환 → AS 행(seq_no) 노출 → 클릭 → 기존 상세로 딥링크
    await page.getByRole("tab", { name: /^A\/S/ }).click();
    await page.getByRole("link", { name: new RegExp(serviceSeqNo) }).click();
    await page.waitForURL(new RegExp(`/admin/service-requests/${serviceId}$`), { timeout: 15_000 });

    // #6 역방향 링크 — AS 상세에서 고객 통합이력으로 되돌아갈 수 있어야 함.
    await expect(page.getByRole("link", { name: /통합 이력 보기/ })).toBeVisible();
  });

  // 5-2: E5a — 영업담당은 본인 담당이 아닌 고객(assignee 없음)을 RLS로 못 본다 → 이력 데이터 미노출.
  test("5-2: 영업 계정 → 타 담당 고객 상세는 RLS로 가려짐(데이터 미노출)", async ({ page }) => {
    expect(companyId).toBeTruthy();
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto(`/admin/customers/${companyId}`);
    // 회사명·통합이력이 노출되지 않는다(not-found 또는 권한 거부로 데이터 미렌더).
    await expect(page.getByText(PF_COMPANY_NAME)).toHaveCount(0, { timeout: 15_000 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 시나리오 6(Task 7) — 고객 등록 필수 강화: 필수 누락 차단 · 사업자번호 중복 실시간 경고
// + 저장 잠금 · '사업자번호 없음' 예외 등록 성공.
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("시나리오 6 — 고객 등록 필수 검증(Task 7)", () => {
  test.beforeAll(async () => {
    try {
      // 이전 실행 잔여 정리(멱등) — biz_no·업체명 양쪽 기준.
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.1000039595`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.${DUP_LIVE_BIZ_NO}`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(
        `/rest/v1/companies?name=like.${encodeURIComponent("E2E중복%")}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/companies?name=eq.${encodeURIComponent(NO_BIZNO_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/companies?name=eq.${encodeURIComponent("테스트상사")}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    } catch (e) {
      console.warn("시나리오 6 setup 정리 건너뜀:", e);
    }
  });

  test.afterAll(async () => {
    try {
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.1000039595`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(`/rest/v1/companies?biz_no=eq.${DUP_LIVE_BIZ_NO}`, {
        method: "DELETE", headers: { Prefer: "return=minimal" },
      });
      await serviceRoleFetch(
        `/rest/v1/companies?name=eq.${encodeURIComponent(NO_BIZNO_COMPANY_NAME)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
      await serviceRoleFetch(
        `/rest/v1/companies?name=eq.${encodeURIComponent("테스트상사")}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    } catch (e) {
      console.warn("시나리오 6 cleanup 건너뜀:", e);
    }
  });

  // 6-1: 대표자·주소·연락처 미입력 → 저장 클릭해도 client validation 에러만 뜨고 redirect 없음.
  test("6-1: 필수 누락(대표자·주소·연락처) → 저장 불가 + 에러 노출", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers/new");

    const nameInput = page.getByLabel("업체명");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });
    await nameInput.fill("테스트상사");
    // 사업자번호만 넣고 나머지 필수(대표자·주소·연락처)는 비움 → 저장 시 에러 노출
    // (체크섬 유효값 — 가중치 알고리즘 검증 완료. 이 값 자체는 이 테스트의 관심사가 아님.)
    await page.getByLabel("사업자등록번호").fill("1000039595");
    await page.getByRole("button", { name: "저장" }).click();

    // 대표자·주소·연락처 3개 필수가 모두 비어 있어 에러가 동시에 3개 뜬다(strict mode 위반
    // 방지로 .first() 사용) — 정확한 에러 문구로 매칭(라벨/제목 "연락처(대표)" 등과 겹치지 않게).
    await expect(
      page
        .getByText(
          /대표자를 입력하세요|주소를 입력하세요|연락처\(휴대폰·전화1·대표연락처\)를 하나 이상 입력하세요/,
        )
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    // 저장이 막혀 여전히 등록 페이지에 머문다(edit 페이지로 redirect 안 됨).
    await expect(page).toHaveURL(/\/admin\/customers\/new/);
  });

  // 6-2: 기존 사업자번호를 새 폼에 입력 → 실시간 경고 카드 노출 + 저장 버튼 잠금.
  test("6-2: 기존 사업자번호 입력 → 실시간 경고 + 저장 잠금", async ({ page }) => {
    await login(page);

    // ① 회사 A 먼저 등록(필수 다 채움) — 이 세션에서 자족적으로 만든다.
    await page.goto("/admin/customers/new");
    const nameInput = page.getByLabel("업체명");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });
    await nameInput.fill(DUP_LIVE_COMPANY_NAME);
    await page.getByLabel("사업자등록번호").fill(DUP_LIVE_BIZ_NO);
    await page.getByLabel("대표자").fill("박대표");
    await page.getByRole("textbox", { name: "본사주소" }).fill("서울시 종로구 테스트로 3");
    await page.getByLabel("휴대폰").fill("010-5555-6666");
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+\/edit$/, { timeout: 20_000 });

    // ② 새 폼에서 같은 사업자번호 입력 → 실시간 경고 + 저장 잠금.
    await page.goto("/admin/customers/new");
    await expect(page.getByLabel("업체명")).toBeEnabled({ timeout: 15_000 });
    await page.getByLabel("사업자등록번호").fill(DUP_LIVE_BIZ_NO);

    await expect(page.getByText("이미 등록된 업체")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  // 6-3: '사업자번호 없음' 체크 → biz_no 없이도 저장 성공(개인·미발급 예외 경로).
  test("6-3: 사업자번호 없음 체크 → 사업자번호 없이 등록 성공", async ({ page }) => {
    await login(page);
    await page.goto("/admin/customers/new");

    const nameInput = page.getByLabel("업체명");
    await expect(nameInput).toBeEnabled({ timeout: 15_000 });
    await nameInput.fill(NO_BIZNO_COMPANY_NAME);
    await page.getByLabel("대표자").fill("김개인");
    await page.getByRole("textbox", { name: "본사주소" }).fill("부산시 해운대구 테스트로 4");
    await page.getByLabel("휴대폰").fill("010-9999-8888");
    await page.getByLabel("사업자번호 없음(개인·미발급)").check();
    await page.getByRole("button", { name: "저장" }).click();

    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+\/edit$/, { timeout: 20_000 });
  });
});
