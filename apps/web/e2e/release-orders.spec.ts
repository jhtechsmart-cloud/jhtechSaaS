import { test, expect, type Page } from "@playwright/test";

// 장비출고의뢰서 작성 E2E (Phase 3b).
// REST(service_role)로 의뢰 + 발행 견적(설치일 포함) 시드 → admin 로그인 → 의뢰 상세 →
// '출고의뢰서' 진입 → 자동채움 확인 + 체크박스 입력 → 임시저장 → 발행 → 의뢰 상세 복귀.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const APP_BIZ = "8012345699";
const APP_CO = "E2E_출고의뢰사";

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
  // applications 삭제 시 quotes·release_orders는 ON DELETE CASCADE로 함께 제거.
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

test.describe.serial("출고의뢰서 작성 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const appRes = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          company: APP_CO,
          biz_no: APP_BIZ,
          phone: "010-1234-5678",
          address: "서울시 강남구 1",
          status: "quoted",
          fields: { install_survey: { power: "single_220", building_type: "factory" } },
        },
      ]),
    });
    if (!appRes.ok) throw new Error(`application 시드 실패: ${appRes.status} ${await appRes.text()}`);
    appId = ((await appRes.json()) as Array<{ id: string }>)[0].id;

    // 발행 견적(설치일 포함) — 출고의뢰서 진입·발행 전제.
    const qRes = await rest("quotes", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          application_id: appId,
          quote_no: "PENDING",
          version: 1,
          items: [{ name: "UV3300S" }],
          options: [],
          supply_price: 1000000,
          tax_price: 100000,
          total: 1100000,
          status: "issued",
          delivery_date: "2026-07-01",
          delivery_time: "13:30:00",
        },
      ]),
    });
    if (!qRes.ok) throw new Error(`quote 시드 실패: ${qRes.status} ${await qRes.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("의뢰→출고의뢰서 진입→자동채움·체크→임시저장→발행→복귀", async ({ page }) => {
    await login(page);

    // 1) 의뢰 상세 → '출고의뢰서' 진입
    await page.goto(`/admin/applications/${appId}`);
    await page.getByTestId("release-order-link").click();
    await page.waitForURL(/\/release-order$/, { timeout: 20_000 });

    // 2) 자동채움 확인(제목 회사명 + 편집 가능 입력칸에 장비명·설치일시 프리필)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(APP_CO);
    await expect(page.getByLabel("장비명")).toHaveValue("UV3300S");
    await expect(page.getByLabel("설치일")).toHaveValue("2026-07-01");
    await expect(page.getByLabel("설치 시각")).toHaveValue("13:30");

    // 2-b) 본사/설치 주소 — 연결 고객 없으면 의뢰주소 프리필, '동일' 기본 체크(설치 비활성)
    await expect(page.getByLabel("본사주소", { exact: true })).toHaveValue("서울시 강남구 1");
    await expect(page.getByLabel("설치 주소")).toBeDisabled();
    // 본사주소 변경 → 동일 체크 중이라 설치주소 자동 동기화
    await page.getByLabel("본사주소", { exact: true }).fill("서울 본사테스트");
    await expect(page.getByLabel("설치 주소")).toHaveValue("서울 본사테스트");
    // 동일 해제 → 설치주소 독립 입력(별개 주소)
    await page.getByLabel("설치주소가 본사주소와 동일").uncheck();
    await expect(page.getByLabel("설치 주소")).toBeEnabled();
    await page.getByLabel("설치 주소").fill("부산 설치현장");

    // 3) 프린터 칼라 체크박스 토글
    await page.getByRole("button", { name: "CMYK" }).click();

    // 3-b) 기본 준비사항 — 박스별 특이사항 입력(운송차량·전기)
    await page.getByLabel("운송차량 특이사항").fill("지게차 필요");
    await page.getByLabel("전기 관련 사전준비 특이사항").fill("380V 분전반 확인");

    // 4) 임시저장 → 안내(버튼 옆 피드백)
    await page.getByTestId("release-save").click();
    await expect(page.getByTestId("release-feedback")).toContainText("임시저장", { timeout: 15_000 });

    // 4-b) 재진입 시 특이사항 복원(저장 반영 확인)
    await page.goto(`/admin/applications/${appId}/release-order`);
    await expect(page.getByLabel("운송차량 특이사항")).toHaveValue("지게차 필요");
    await expect(page.getByLabel("전기 관련 사전준비 특이사항")).toHaveValue("380V 분전반 확인");

    // 5) 발행 + PDF 생성 → 의뢰 상세로 복귀
    await page.getByTestId("release-issue").click();
    await page.waitForURL(new RegExp(`/admin/applications/${appId}$`), { timeout: 20_000 });
  });

  test("발행본 재진입 → 수정 임시저장 → 새 버전(V2) 생성 + 버전 이력 노출", async ({ page }) => {
    await login(page);
    // 발행된 출고의뢰서(V1) 재진입 → 발행 배너 표시
    await page.goto(`/admin/applications/${appId}/release-order`);
    await expect(page.getByText(/발행됨 \(V1\)/)).toBeVisible({ timeout: 20_000 });

    // 내용 수정(헤드 종류) 후 임시저장 → 새 버전 생성
    await page.getByLabel("헤드 종류").fill("새 버전 헤드");
    await page.getByTestId("release-save").click();
    await expect(page.getByTestId("release-feedback")).toContainText("저장", { timeout: 15_000 });

    // 재진입 → 버전 이력에 V2(임시저장)·V1(발행) 노출
    await page.goto(`/admin/applications/${appId}/release-order`);
    await expect(page.getByText("버전 이력")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("V2", { exact: true })).toBeVisible();
    await expect(page.getByText("V1", { exact: true })).toBeVisible();
  });
});
