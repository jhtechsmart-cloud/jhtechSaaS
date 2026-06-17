import { test, expect, type Page } from "@playwright/test";

// E6 견적 메일 발송 E2E — 발행 견적 + PDF + 담당자 하이웍스ID를 REST(service_role)로 시드 →
// admin 로그인 → 의뢰 상세 → '메일 발송' 버튼 → 모달(수신처 프리필) → 발송 → '발송 중' 배지.
// 워커가 e2e에 없으므로 발송 후 email_log는 pending → 배지는 '메일 발송 중…'(enqueue 성공 증명).
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const APP_BIZ = "8012345671";
const APP_CO = "E2E_메일발송사";

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

test.describe.serial("E6 견적 메일 발송 E2E", () => {
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

    // PDF 업로드 + pdf_url(워커가 했을 일을 시드).
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
    // 트리거가 만든 이 견적의 PDF 잡 제거(다른 spec 잡은 보호).
    await rest(`jobs?type=eq.quote_pdf&payload->>quote_id=eq.${quoteId}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});

    // 발송자(admin)에 하이웍스 ID.
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

  test("발행 견적 → 메일 발송 버튼 → 모달 → 발송 → '발송 중' 배지", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/applications/${appId}`);

    const sendBtn = page.getByRole("button", { name: "메일 발송" });
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // 모달 — 제목 + 수신처 프리필(신청 이메일).
    await expect(page.getByText("견적서 메일 발송", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("customer@example.com")).toHaveValue("cust@example.com");

    await page.getByRole("button", { name: "발송", exact: true }).click();

    // 워커 없음 → email_log pending → '메일 발송 중…' 배지(enqueue 성공).
    await expect(page.getByText("메일 발송 중…")).toBeVisible({ timeout: 20_000 });
  });

  test("발송 완료(sent) → '재발송' 버튼 + 모달에 직전 발송 안내", async ({ page }) => {
    // 워커 대역 — 앞 테스트가 만든 email_log(pending)를 sent로 전이 + 수신처를 오타 주소로.
    await rest(`email_log?quote_id=eq.${quoteId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "sent", to_email: "wrong@addr.com" }),
    });

    await login(page);
    await page.goto(`/admin/applications/${appId}`);

    // 죽은 배지가 아니라 '발송됨' 확인 + '재발송' 버튼이 떠야 한다.
    await expect(page.getByText("✓ 메일 발송됨")).toBeVisible();
    const resend = page.getByRole("button", { name: "다른 주소로 재발송" });
    await expect(resend).toBeVisible();
    await resend.click();

    // 모달 — 재발송 안내 + 직전 발송(오타 주소) 정보.
    await expect(page.getByText("이미 발송된 견적입니다", { exact: false })).toBeVisible();
    await expect(page.getByText(/직전 발송: wrong@addr\.com/)).toBeVisible();
  });
});
