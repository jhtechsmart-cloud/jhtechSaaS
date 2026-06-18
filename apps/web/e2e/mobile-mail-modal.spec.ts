import { test, expect, type Page } from "@playwright/test";

// 모바일 메일 모달 — 짧은 화면(키보드 올라온 상황 모사)에서 모달이 뷰포트 안에 갇히고
// (max-h-[90dvh] + overflow-y-auto) 내부 스크롤로 '발송' 버튼에 도달 가능한지 검증.
// 발행 견적 + PDF + 담당자 하이웍스ID를 REST(service_role)로 시드(quote-email.spec.ts 패턴).
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const APP_BIZ = "8012345672"; // quote-email.spec.ts(8012345671)와 충돌 회피
const APP_CO = "E2E_모바일메일사";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function adminUserId(): Promise<string> {
  const res = await fetch(`${SB}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const json = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (json.users ?? []).find((x) => x.email === ADMIN_EMAIL);
  if (!u) throw new Error("admin 사용자 없음 — seed-local 필요");
  return u.id;
}

async function cleanup() {
  await rest(`applications?biz_no=eq.${APP_BIZ}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

let appId: string;
let quoteId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

// 키보드가 올라온 좁은 폰을 모사하는 짧은 뷰포트.
test.use({ viewport: { width: 390, height: 480 } });

test.describe.serial("모바일 메일 모달", () => {
  test.beforeAll(async () => {
    await cleanup();
    const a = await rest("applications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ company: APP_CO, biz_no: APP_BIZ, email: "cust@example.com", status: "new", fields: {} }]),
    });
    if (!a.ok) throw new Error(`application 시드 실패: ${a.status} ${await a.text()}`);
    appId = ((await a.json()) as { id: string }[])[0].id;

    const q = await rest("quotes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ application_id: appId, status: "issued" }]),
    });
    if (!q.ok) throw new Error(`quote 시드 실패: ${q.status} ${await q.text()}`);
    quoteId = ((await q.json()) as { id: string }[])[0].id;

    await fetch(`${SB}/storage/v1/object/quote-pdfs/${quoteId}.pdf`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/pdf" },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    }).catch(() => {});
    await rest(`quotes?id=eq.${quoteId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ pdf_url: `${quoteId}.pdf` }),
    });
    await rest(`jobs?type=eq.quote_pdf&payload->>quote_id=eq.${quoteId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});

    const uid = await adminUserId();
    await rest(`profiles?id=eq.${uid}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ hiworks_user_id: "admin" }),
    });
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("짧은 화면: 모달이 뷰포트 안에 갇히고 발송 버튼 도달 가능", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/applications/${appId}`);

    await page.getByRole("button", { name: "메일 발송" }).click();
    await expect(page.getByText("견적서 메일 발송", { exact: true })).toBeVisible();

    // 모달 패널: max-h-[90dvh]로 뷰포트 안에 들어오고, 내용이 더 길어 내부 스크롤 가능.
    const panel = await page.getByTestId("mail-modal-panel").evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(panel.client).toBeLessThanOrEqual(panel.viewport); // 뷰포트 밖으로 안 넘침
    expect(panel.scroll).toBeGreaterThan(panel.client); // 내용이 길어 스크롤(발송 버튼이 아래)

    // 발송 버튼이 스크롤로 도달 가능 — 클릭하면 enqueue → '메일 발송 중…' 배지.
    await page.getByRole("button", { name: "발송", exact: true }).click();
    await expect(page.getByText("메일 발송 중…")).toBeVisible({ timeout: 20_000 });
  });
});
