import { test, expect, type Page } from "@playwright/test";

// 견적서 PDF 사양 선택 E2E.
// REST(service_role)로 [사양 있는 활성 장비 + 의뢰] 시드 → admin 로그인 → 견적 작성 →
// 카탈로그 장비 선택 → "견적서 사양 선택" 섹션 노출 + pdf 플래그대로 체크 상태 →
// 미선택(pdf:false) 항목 체크 → 발행 → quotes.spec_selection에 선택 id 보존 확인.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

const APP_BIZ = "8012345699";
const APP_CO = "E2E_사양선택사";
const EQ_NAME = "E2E_사양장비";
// 안정 사양 id(워커·spec_selection 참조). pdf 플래그: 속도·해상도=true, 무게=false.
const SPEC = [
  {
    group: "성능",
    icon: "gauge",
    items: [
      { id: "e2e-spec-speed", label: "속도", value: "30㎡/h", pdf: true },
      { id: "e2e-spec-dpi", label: "해상도", value: "1200DPI", pdf: true },
      { id: "e2e-spec-weight", label: "무게", value: "85kg", pdf: false },
    ],
  },
];

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
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

let appId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("견적서 PDF 사양 선택 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    // 사양 있는 활성 장비 시드(카탈로그에 노출 = listEquipmentForMatch status='active').
    const eqRes = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ name: EQ_NAME, base_price: 50_000_000, status: "active", specs: SPEC }]),
    });
    if (!eqRes.ok) throw new Error(`equipment 시드 실패: ${eqRes.status} ${await eqRes.text()}`);

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

  test("카탈로그 장비 선택 → 사양 선택 섹션(pdf 플래그대로) → 토글 → 발행 → spec_selection 보존", async ({ page }) => {
    await login(page);

    // 1) 의뢰 상세 → 견적 작성
    await page.goto(`/admin/applications/${appId}`);
    await page.getByRole("link", { name: "견적 작성" }).click();
    await page.waitForURL(/\/quote\/new$/, { timeout: 20_000 });

    // 2) 카탈로그 장비 선택(직접입력 아님) → 사양이 폼에 붙는다.
    await page.getByLabel("장비 선택").first().selectOption({ label: EQ_NAME });

    // 3) "견적서 사양 선택" 섹션 노출 + pdf 플래그대로 초기 체크 상태.
    const section = page.getByTestId("spec-selection");
    await expect(section).toBeVisible();
    await expect(section.getByText("2/15줄")).toBeVisible(); // 속도+해상도(pdf:true)=2줄, 예산 15
    await expect(section.locator("label", { hasText: "속도" }).getByRole("checkbox")).toBeChecked();
    await expect(section.locator("label", { hasText: "해상도" }).getByRole("checkbox")).toBeChecked();
    await expect(section.locator("label", { hasText: "무게" }).getByRole("checkbox")).not.toBeChecked();

    // 4) 미선택(pdf:false)인 무게를 체크 → 선택에 추가.
    await section.locator("label", { hasText: "무게" }).getByRole("checkbox").check();
    await expect(section.locator("label", { hasText: "무게" }).getByRole("checkbox")).toBeChecked();

    // 5) 발행 → 의뢰 상세 복귀.
    await page.getByRole("button", { name: "발행하기" }).click();
    await page.waitForURL(new RegExp(`/admin/applications/${appId}$`), { timeout: 20_000 });

    // 6) quotes.spec_selection에 선택한 3개 id 보존(속도·해상도 기본 + 무게 추가).
    const q = await rest(`quotes?application_id=eq.${appId}&select=spec_selection`, { method: "GET" });
    const rows = (await q.json()) as Array<{ spec_selection: string[] | null }>;
    expect(rows.length).toBeGreaterThan(0);
    const sel = rows[0]!.spec_selection ?? [];
    expect(sel).toContain("e2e-spec-speed");
    expect(sel).toContain("e2e-spec-dpi");
    expect(sel).toContain("e2e-spec-weight");
  });
});
