import { test, expect, type Page } from "@playwright/test";

// #4 재고현황 E2E — admin이 사이드바 재고현황 진입 → 장비 재고 수량 입력·저장 → 반영.
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const EQ_NAME = "E2E_재고테스트장비";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let eqId: string;

async function cleanup() {
  // 재고행은 equipment 삭제 시 cascade. 장비 먼저 재고 제거 후 장비 삭제.
  if (eqId) {
    await rest(`equipment_inventory?equipment_id=eq.${eqId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("재고현황", () => {
  test.beforeAll(async () => {
    await cleanup();
    const r = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: EQ_NAME, model: "INV-1", status: "active" }]),
    });
    if (!r.ok) throw new Error(`equipment 시드 실패: ${r.status} ${await r.text()}`);
    eqId = ((await r.json()) as { id: string }[])[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("사이드바 재고현황 → 수량 입력·저장 → 반영", async ({ page }) => {
    await login(page);
    // 사이드바 링크(데스크톱) — 여러 nav에 중복 가능하므로 first.
    await page.getByRole("link", { name: "재고현황" }).first().click();
    await page.waitForURL(/\/admin\/inventory/, { timeout: 20_000 });

    const qty = page.getByLabel(`${EQ_NAME} 재고 수량`);
    await expect(qty).toBeVisible();
    await qty.fill("12");
    // 같은 행 저장 버튼.
    const row = page.locator("tr", { hasText: EQ_NAME });
    await row.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("재고 저장됨", { exact: false })).toBeVisible({ timeout: 20_000 });

    // 새로고침 후에도 값 유지(영속).
    await page.reload();
    await expect(page.getByLabel(`${EQ_NAME} 재고 수량`)).toHaveValue("12");
    // 수량>0 → '재고 있음' 배지.
    await expect(page.locator("tr", { hasText: EQ_NAME }).getByText("재고 있음")).toBeVisible();
  });
});
