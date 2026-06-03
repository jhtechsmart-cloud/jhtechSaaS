import { test, expect } from "@playwright/test";

// 로컬 Supabase 표준 데모 키(비밀 아님). public-catalog.spec.ts와 동일.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EQ_NAME = "E2E 견적요청 장비";
const COMPANY = "E2E상사";
// 국세청 체크섬을 통과하는 유효 사업자번호(1234567891). 1234567890은 무효.
const VALID_BIZ_NO = "1234567891";

function rest(pathAndQuery: string, init: RequestInit) {
  return fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
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
  // 테스트가 만든 applications 행 + 시드 장비를 모두 제거(이름 기준).
  await rest(`applications?company=eq.${encodeURIComponent(COMPANY)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

// 코어 6필드 — 라벨이 input을 감싸므로 getByLabel로 접근 가능.
async function fillCoreFields(
  page: import("@playwright/test").Page,
) {
  await page.getByLabel("회사명").fill(COMPANY);
  await page.getByLabel("대표자명").fill("홍길동");
  await page.getByLabel("사업자등록번호").fill(VALID_BIZ_NO);
  await page.getByLabel("연락처").fill("02-1234-5678");
  await page.getByLabel("이메일").fill("e2e@example.com");
  await page.getByLabel("주소").fill("서울시 강남구");
}

let equipmentId: string;

test.describe.serial("대형 견적폼 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const res = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { name: EQ_NAME, base_price: 1000000, status: "active", model: "REQ-E2E", specs: [] },
      ]),
    });
    if (!res.ok) throw new Error(`E2E 시드 실패: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ id: string }>;
    equipmentId = rows[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("카탈로그 장비선택 → 견적폼에 장비 사전선택", async ({ page }) => {
    await page.goto("/equipment");
    // 시드 장비 카드의 [장비선택] 버튼 → /request?equipment_id=<id> 로 이동.
    const card = page.locator("div", { hasText: EQ_NAME }).last();
    await card.getByRole("link", { name: "장비선택" }).click();

    await page.waitForURL(new RegExp(`/request\\?equipment_id=${equipmentId}`));
    // "선택 장비" 칩에 장비명 표시.
    await expect(page.getByText(EQ_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test("동의 미체크 제출 차단(인라인 에러·미이동)", async ({ page }) => {
    await page.goto(`/request?equipment_id=${equipmentId}`);
    await expect(page.getByText(EQ_NAME)).toBeVisible({ timeout: 15_000 });

    // 코어 6필드는 유효하게 채우되 개인정보 동의는 체크하지 않음.
    await fillCoreFields(page);
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();

    // 동의 미체크 → /request에 머물고, 상단 에러 요약 배너(#4)에 누락 항목이 떠야 함.
    // role=alert는 Next route-announcer와도 겹쳐 배너 텍스트로 좁힌다.
    await expect(page).toHaveURL(/\/request\?equipment_id=/);
    const banner = page.getByRole("alert").filter({ hasText: "입력하지 않았거나 잘못된 항목이" });
    await expect(banner).toContainText("개인정보 수집·이용 동의가 필요합니다");
  });

  test("정상 제출 → 접수번호(REQ-) 표시", async ({ page }) => {
    await page.goto(`/request?equipment_id=${equipmentId}`);
    await expect(page.getByText(EQ_NAME)).toBeVisible({ timeout: 15_000 });

    // 개인정보 동의 체크.
    await page
      .getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ })
      .check();
    await fillCoreFields(page);
    // 설치설문 select는 기본값(공장 등)이 유효하므로 추가 조작 불필요. 사진은 선택이라 생략.
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();

    await page.waitForURL(/\/request\/success\?no=REQ-/, { timeout: 15_000 });
    await expect(page.getByText(/REQ-\d{8}-\d{5,}/)).toBeVisible();
  });

  test("DB 검증 — privacy_consent·equipment_id·install_survey 저장", async () => {
    // 직전 정상 제출 행을 service_role REST로 조회.
    const check = await rest(
      `applications?company=eq.${encodeURIComponent(COMPANY)}&select=status,assignee_id,privacy_consent,equipment_id,fields`,
      { method: "GET" },
    );
    const rows = (await check.json()) as Array<{
      status: string;
      assignee_id: string | null;
      privacy_consent: boolean;
      equipment_id: string | null;
      fields: { install_survey?: { building_type?: string } };
    }>;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("new");
    expect(rows[0].assignee_id).toBeNull();
    expect(rows[0].privacy_consent).toBe(true);
    expect(rows[0].equipment_id).toBe(equipmentId);
    // 설치설문이 fields에 보존됐는지(building_type 등).
    expect(rows[0].fields.install_survey?.building_type).toBe("factory");
  });
});
