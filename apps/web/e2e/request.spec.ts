import { test, expect } from "@playwright/test";

// 로컬 Supabase 표준 데모 키(비밀 아님). public-catalog.spec.ts와 동일.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EQ_NAME = "E2E 견적요청 장비";
const COMPANY = "E2E 견적상사";

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
  await rest(`applications?company=eq.${encodeURIComponent(COMPANY)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

let equipmentId: string;

test.describe.serial("견적요청 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const res = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { name: EQ_NAME, base_price: 1000000, status: "active", model: "REQ-E2E", category: "포장기", specs: [] },
      ]),
    });
    if (!res.ok) throw new Error(`E2E 시드 실패: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ id: string }>;
    equipmentId = rows[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("작성→제출→접수번호 + DB 저장(new·미배정·fields)", async ({ page }) => {
    await page.goto(`/request?equipment=${equipmentId}`);
    await expect(page.getByText(EQ_NAME)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("회사명").fill(COMPANY);
    await page.getByLabel("대표자명").fill("홍길동");
    await page.getByLabel("사업자등록번호").fill("123-45-67890");
    await page.getByLabel("연락처").fill("02-1234-5678");
    await page.getByLabel("이메일").fill("e2e@example.com");
    await page.getByLabel("주소").fill("서울시 강남구");
    await page.getByLabel("요청사항").fill("E2E 테스트 요청");
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();

    await page.waitForURL(/\/request\/success\?no=REQ-/, { timeout: 15_000 });
    await expect(page.getByText(/REQ-\d{8}-\d{5,}/)).toBeVisible();

    // DB 저장 확인(service role REST).
    const check = await rest(
      `applications?company=eq.${encodeURIComponent(COMPANY)}&select=status,assignee_id,fields`,
      { method: "GET" },
    );
    const rows = (await check.json()) as Array<{ status: string; assignee_id: string | null; fields: Record<string, unknown> }>;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("new");
    expect(rows[0].assignee_id).toBeNull();
    expect(rows[0].fields.equipment_id).toBe(equipmentId);
  });

  test("빈 폼 제출 시 인라인 에러·미이동", async ({ page }) => {
    await page.goto(`/request`);
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();
    await expect(page.getByText("회사명을 입력하세요")).toBeVisible();
    await expect(page).toHaveURL(/\/request$/);
  });
});
