import { test, expect, type Page } from "@playwright/test";

// E4 — 견적 트리아지 콘솔 E2E. REST(service_role)로 미등록 견적 1건 시드 →
// admin 목록→상세→배정(new→assigned 자동전이)→상태변경(견적중)→고객등록→P-F 링크.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 다른 spec과 충돌 없는 전용 값.
const APP_BIZ = "7012345674";
const APP_CO = "E2E_견적미등록사";

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
  await rest(`applications?biz_no=eq.${APP_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await rest(`companies?biz_no=eq.${APP_BIZ}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let seqNo: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\/equipment/, { timeout: 20_000 });
}

test.describe.serial("E4 견적 트리아지 콘솔 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    // 미등록 견적 1건 시드(status='new', biz_no는 companies에 없음 → 미등록).
    // seq_no는 트리거가 자동 생성하므로 지정하지 않음.
    const res = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          company: APP_CO,
          ceo: "박대표",
          biz_no: APP_BIZ,
          phone: "010-9876-5432",
          email: "app@e2e.test",
          address: "경기도 화성시",
          status: "new",
          fields: {
            requirements: "E2E 견적 요청사항",
            equipment_name: "E2E_견적장비",
            install_survey: {
              building_type: "factory",
              location: "ground",
              elevator: "have",
              handling: ["manual", "ladder"],
              power: "triple_380",
              pneumatic: "have",
              extra: "지게차 사용 가능",
            },
            photos: {},
          },
        },
      ]),
    });
    if (!res.ok) throw new Error(`application 시드 실패: ${res.status} ${await res.text()}`);
    seqNo = ((await res.json()) as Array<{ seq_no: string }>)[0].seq_no;
    expect(seqNo).toMatch(/^REQ-\d{8}-\d{5,}$/);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("목록→상세→배정(자동 assigned)→상태변경→고객등록→P-F링크", async ({ page }) => {
    await login(page);

    // 1) 목록에 시드 견적이 보인다.
    await page.goto("/admin/applications");
    await expect(page.getByRole("heading", { name: "견적 신청" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(APP_CO).first()).toBeVisible({ timeout: 15_000 });

    // 2) 상세로 이동.
    await page.getByText(APP_CO).first().click();
    await page.waitForURL(/\/admin\/applications\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByText("접수번호")).toBeVisible();
    await expect(page.getByText("미등록 고객")).toBeVisible();
    // 설치설문 라벨맵 렌더 확인.
    await expect(page.getByText("공장")).toBeVisible();
    await expect(page.getByText("3상 380V")).toBeVisible();

    // 미배정 상태에선 상태 변경 불가 — 안내 메시지 노출(담당자 먼저 배정 워크플로 강제).
    await expect(page.getByText("담당자를 먼저 배정해주세요")).toBeVisible();

    // 3) 담당 배정 → status new→assigned 자동 전이. 배지(testid)로 정밀 단언.
    const assign = page.getByRole("combobox").first();
    await assign.selectOption({ index: 1 });
    await page.getByRole("button", { name: "담당 저장" }).click();
    await expect(page.getByTestId("app-status")).toHaveText("배정", { timeout: 15_000 });

    // 4) 상태 변경: 견적중.
    const statusSelect = page.getByRole("combobox").nth(1);
    // Regression: QA-001 — 배정 auto-bump 후 상태 드롭다운이 stale '접수'로 남지 않고
    // 서버값('assigned')으로 동기화됐는지(서버값 key remount). Found by /qa 2026-06-04.
    await expect(statusSelect).toHaveValue("assigned");
    await statusSelect.selectOption({ label: "견적중" });
    await page.getByRole("button", { name: "상태 변경" }).click();
    await expect(page.getByTestId("app-status")).toHaveText("견적중", { timeout: 15_000 });

    // 4b) DB에서 실제 status 전이 확인(배지 텍스트만으론 거짓통과 가능).
    const dbRes = await rest(`applications?biz_no=eq.${APP_BIZ}&select=status,assignee_id`, { method: "GET" });
    const dbRows = (await dbRes.json()) as Array<{ status: string; assignee_id: string | null }>;
    expect(dbRows[0].status).toBe("quoted");
    expect(dbRows[0].assignee_id).not.toBeNull();

    // 5) 미등록 고객 등록 → P-F(고객 상세)로 이동 + 업체명 표시 확인.
    await page.getByRole("button", { name: "고객으로 등록" }).click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByText(APP_CO).first()).toBeVisible({ timeout: 15_000 });
  });
});
