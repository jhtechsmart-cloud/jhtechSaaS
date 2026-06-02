import { test, expect } from "@playwright/test";

// 로컬 Supabase 표준 데모 키(비밀 아님 — 공개 표준 값). equipment.spec.ts와 동일.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ACTIVE_NAME = "E2E 공개 활성장비";
const INACTIVE_NAME = "E2E 공개 비활성장비";

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
  for (const name of [ACTIVE_NAME, INACTIVE_NAME]) {
    await rest(`equipment?name=eq.${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
  }
}

test.beforeAll(async () => {
  await cleanup();
  const res = await rest("equipment", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    // PostgREST 벌크 INSERT: 모든 행의 키가 동일해야 함(PGRST102 방지)
    body: JSON.stringify([
      {
        name: ACTIVE_NAME,
        base_price: 1000000,
        status: "active",
        model: "PK-E2E",
        specs: [{ label: "전압", value: "220V" }],
      },
      {
        name: INACTIVE_NAME,
        base_price: 2000000,
        status: "inactive",
        model: null,
        specs: [],
      },
    ]),
  });
  if (!res.ok) {
    throw new Error(`E2E 시드 실패: ${res.status} ${await res.text()}`);
  }
});

test.afterAll(async () => {
  await cleanup();
});

test("공개 카탈로그: active 노출 + inactive 비노출 + 상세 진입", async ({ page }) => {
  await page.goto("/equipment");

  // active 카드 노출(카드 제목 = h2)
  await expect(page.getByRole("heading", { name: ACTIVE_NAME })).toBeVisible({ timeout: 15_000 });
  // inactive는 equipment_public에서 제외 → 미노출
  await expect(page.getByText(INACTIVE_NAME)).toHaveCount(0);

  // 카드 클릭 → 상세
  // 카드 재설계(P-A2): 카드 전체 <Link>가 아니라 [상세정보]/[장비선택] 2버튼 구조.
  // 사진 없는 시드는 이미지 링크 접근명이 "이미지 없음"이라 이름 매칭 불가.
  // 카탈로그에는 active 장비가 모두 노출되므로(타 spec 시드 공존 가능) 전역 .first()는
  // 불안정 → ACTIVE_NAME 제목을 가진 카드(<li>)로 범위를 좁혀 그 안의 "상세정보" 클릭.
  const activeCard = page
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: ACTIVE_NAME }) });
  await activeCard.getByRole("link", { name: "상세정보" }).click();
  await page.waitForURL(/\/equipment\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  // 상세에 이름(h1)·스펙 노출, 가격 미노출
  await expect(page.getByRole("heading", { name: ACTIVE_NAME })).toBeVisible();
  await expect(page.getByText("전압")).toBeVisible();
  await expect(page.getByText("220V")).toBeVisible();
  await expect(page.getByText("1000000")).toHaveCount(0);

  // 견적 요청 CTA 존재(P2에서 /request 배선)
  await expect(page.getByRole("link", { name: "이 장비로 견적 요청" })).toBeVisible();
});
