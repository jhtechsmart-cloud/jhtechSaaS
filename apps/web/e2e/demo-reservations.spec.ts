import { test, expect, type Page } from "@playwright/test";

// 데모예약 E2E — 스펙 핵심 시나리오:
// ① 14:00–15:30 예약 존재 상태에서 13:00 + 90분 선택 → 충돌 경고 + 저장 비활성
// ② 10:00 + 90분 → 저장 성공 → 목록 타임라인에 블록 표시
// ③ 사이드바 '데모예약' 메뉴 진입
// ④ 예약 취소 후 같은 시간 재등록 가능(EXCLUDE는 canceled 제외)
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 미래 고정 날짜(오늘 기준 의존 제거) + e2e 전용 표식 이름
const DATE = "2027-03-02";
const EQ_NAME = "E2E_데모장비";
const CUSTOMER_SEED = "E2E_데모고객_기존";
const CUSTOMER_NEW = "E2E_데모고객_신규";

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
  await rest(`demo_reservations?customer_name=like.E2E_데모고객*`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

let equipmentId: string;
let adminId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

async function seedReservation(start: string, end: string): Promise<void> {
  const res = await rest("demo_reservations", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      customer_name: CUSTOMER_SEED,
      equipment_id: equipmentId,
      time_range: `[${DATE}T${start}:00+09:00,${DATE}T${end}:00+09:00)`,
      created_by: adminId,
    }),
  });
  if (!res.ok) throw new Error(`예약 시드 실패: ${res.status} ${await res.text()}`);
}

test.describe.serial("데모예약 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const eqRes = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ name: EQ_NAME, base_price: 1000, status: "active" }]),
    });
    if (!eqRes.ok) throw new Error(`장비 시드 실패: ${eqRes.status}`);
    equipmentId = ((await eqRes.json()) as Array<{ id: string }>)[0].id;

    const profRes = await rest("profiles?select=id&limit=1");
    adminId = ((await profRes.json()) as Array<{ id: string }>)[0].id;

    // 기존 예약: 14:00–15:30 (스펙 시나리오의 전제)
    await seedReservation("14:00", "15:30");
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("사이드바 '데모예약' 메뉴로 목록 진입 — 시드 예약 블록 표시", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "데모예약" }).click();
    await page.waitForURL(/\/admin\/demo-reservations/);
    await page.goto(`/admin/demo-reservations?date=${DATE}`);
    // 고객명은 타임라인 + 월간 예약 리스트 두 곳에 노출되므로 first()로 구체화
    await expect(page.getByText(CUSTOMER_SEED).first()).toBeVisible();
    // "(90분)" 형식은 타임라인 블록 전용 → 블록 렌더 검증
    await expect(page.getByText("14:00–15:30 (90분)")).toBeVisible();
  });

  test("13:00 + 90분 → 충돌 경고 + 저장 비활성 / 10:00 + 90분 → 등록 성공", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);

    // 폼 입력 — 미등록 고객 직접 입력 + 장비 선택
    await page.getByLabel("고객").fill(CUSTOMER_NEW);
    await page.locator("select").selectOption({ label: `${EQ_NAME}` });
    await page.getByRole("button", { name: "90분", exact: true }).click();

    // 14:00 슬롯은 점유로 비활성(취소선)
    await expect(page.getByRole("button", { name: "14:00", exact: true })).toBeDisabled();

    // 13:00 + 90분(13:00–14:30) → 기존 14:00–15:30과 겹침 → 경고 + 저장 비활성
    await page.getByRole("button", { name: "13:00", exact: true }).click();
    await expect(page.getByText("기존 예약과 겹칩니다")).toBeVisible();
    await expect(page.getByRole("button", { name: /예약 저장/ })).toBeDisabled();

    // 10:00 + 90분(10:00–11:30) → 충돌 없음 → 저장 성공 → 목록 이동 + 블록 표시
    await page.getByRole("button", { name: "10:00", exact: true }).click();
    await expect(page.getByText("기존 예약과 겹칩니다")).toBeHidden();
    const save = page.getByRole("button", { name: /예약 저장/ });
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations\\?date=${DATE}`), { timeout: 15_000 });
    // 고객명은 타임라인 + 월간 예약 리스트 두 곳에 노출 → first()
    await expect(page.getByText(CUSTOMER_NEW).first()).toBeVisible();
    await expect(page.getByText("10:00–11:30 (90분)")).toBeVisible();
  });

  test("블록 클릭 → 상세 → 취소 → 같은 시간 재등록 가능", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/demo-reservations?date=${DATE}`);

    // 10:00 블록(앞 테스트 등록분) 상세 열기 → 취소
    await page.getByRole("button", { name: /10:00–11:30/ }).click();
    await page.getByRole("button", { name: "예약 취소" }).click();
    await page.getByRole("button", { name: "취소 확정" }).click();
    await expect(page.getByText("예약이 취소되었습니다")).toBeVisible();
    // router.refresh() 반영 타이밍에 의존하지 않게 명시 reload 후 단언(flaky 방지)
    await page.reload();
    await expect(page.getByText("10:00–11:30 (90분)")).toBeHidden();

    // 같은 시간대(10:00–11:30) 재등록 — canceled는 EXCLUDE에서 제외되므로 성공해야 함
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);
    await page.getByLabel("고객").fill(`${CUSTOMER_NEW}2`);
    await page.locator("select").selectOption({ label: `${EQ_NAME}` });
    await page.getByRole("button", { name: "90분", exact: true }).click();
    await page.getByRole("button", { name: "10:00", exact: true }).click();
    await page.getByRole("button", { name: /예약 저장/ }).click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations\\?date=${DATE}`), { timeout: 15_000 });
    // 고객명은 타임라인 + 월간 예약 리스트 두 곳에 노출 → first()
    await expect(page.getByText(`${CUSTOMER_NEW}2`).first()).toBeVisible();
    // 타임라인 블록 재렌더까지 검증(월간 리스트만으로 통과하지 않게 — "(90분)"은 타임라인 전용)
    await expect(page.getByText("10:00–11:30 (90분)")).toBeVisible();
  });
});
