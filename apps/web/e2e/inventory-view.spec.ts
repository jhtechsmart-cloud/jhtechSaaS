import { test, expect, type Page } from "@playwright/test";

// 영업자용 재고 조회(읽기 전용) E2E — 대시보드 "재고현황 보기" → /admin/inventory/view.
// sales(equipment.manage 없음)도 접근 가능 + 편집 input 없음(읽기 전용) + 모바일 카드.
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";
const EQ_NAME = "E2E_재고조회장비";

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let eqId: string;

async function cleanup() {
  if (eqId) {
    await rest(`equipment_inventory?equipment_id=eq.${eqId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}

async function loginSales(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(SALES_EMAIL);
  await page.getByLabel("비밀번호").fill(SALES_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("영업자 재고 조회(읽기 전용)", () => {
  test.beforeAll(async () => {
    await cleanup();
    const r = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: EQ_NAME, model: "VIEW-1", status: "active" }]),
    });
    if (!r.ok) throw new Error(`equipment 시드 실패: ${r.status} ${await r.text()}`);
    eqId = ((await r.json()) as { id: string }[])[0].id;
    const inv = await rest("equipment_inventory", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ equipment_id: eqId, stock_qty: 8 }]),
    });
    if (!inv.ok) throw new Error(`inventory 시드 실패: ${inv.status} ${await inv.text()}`);
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("sales(equipment.manage 없음)가 대시보드 링크로 재고 조회 + 읽기 전용", async ({ page }) => {
    await loginSales(page);
    await page.goto("/admin/dashboard");
    await page.getByRole("link", { name: "재고현황 보기" }).click();
    await page.waitForURL(/\/admin\/inventory\/view/, { timeout: 20_000 });

    // 장비·수량·상태 노출.
    await expect(page.getByText(EQ_NAME).first()).toBeVisible();
    await expect(page.getByText("재고 있음").first()).toBeVisible();
    // 읽기 전용 — 편집용 수량 입력(number=spinbutton)·저장 버튼 없음.
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
  });

  test("모바일 뷰포트 — 카드 렌더(PC 표 헤더 숨김)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginSales(page);
    await page.goto("/admin/inventory/view");
    // 모바일 카드는 DOM에서 PC 표 뒤에 렌더 → 보이는 카드(.last)로 단언(.first는 숨겨진 PC 표).
    await expect(page.getByText(EQ_NAME).last()).toBeVisible();
    // PC 표 전용 헤더 '최종수정'은 모바일(lg 미만)에서 숨겨진다.
    await expect(page.getByText("최종수정")).toBeHidden();
  });
});
