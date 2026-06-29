import { test, expect, type Page } from "@playwright/test";

// 데모예약 E2E — 복수장비·장비별 겹침·담당자 개편 반영:
// ① 14:00–15:30 (EQ) 예약 존재 → 같은 장비 EQ 선택 시 14:00 점유, 13:00+90분 충돌
// ② 다른 장비(EQ2)만 선택하면 같은 시간대(14:00)도 점유 아님(허용)
// ③ 10:00 + 90분 + 담당자 지정 → 저장 성공 → 타임라인 블록 표시
// ④ 예약 취소 후 같은 장비·같은 시간 재등록 가능(EXCLUDE는 canceled 제외)
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 미래 고정 날짜(오늘 기준 의존 제거) + e2e 전용 표식 이름
const DATE = "2027-03-02";
const EQ_NAME = "E2E_데모장비";
const EQ2_NAME = "E2E_데모장비2";
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
  // 부모 삭제 시 자식(demo_reservation_equipment)은 on delete cascade로 함께 제거.
  await rest(`demo_reservations?customer_name=like.E2E_데모고객*`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
  await rest(`equipment?name=like.E2E_데모장비*`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

let equipmentId: string;
let equipmentId2: string;
let adminId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

// 부모 1행 + 자식 1행(장비별 겹침은 자식 EXCLUDE가 차단) 직접 시드.
async function seedReservation(
  start: string,
  end: string,
  eqId = equipmentId,
  dateStr = DATE,
): Promise<void> {
  const range = `[${dateStr}T${start}:00+09:00,${dateStr}T${end}:00+09:00)`;
  const res = await rest("demo_reservations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        customer_name: CUSTOMER_SEED,
        time_range: range,
        status: "confirmed",
        created_by: adminId,
      },
    ]),
  });
  if (!res.ok) throw new Error(`예약 시드 실패: ${res.status} ${await res.text()}`);
  const reservationId = ((await res.json()) as Array<{ id: string }>)[0].id;
  const child = await rest("demo_reservation_equipment", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { reservation_id: reservationId, equipment_id: eqId, time_range: range, status: "confirmed" },
    ]),
  });
  if (!child.ok) throw new Error(`예약 장비 시드 실패: ${child.status} ${await child.text()}`);
}

test.describe.serial("데모예약 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const eqRes = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { name: EQ_NAME, base_price: 1000, status: "active", is_demo: true },
        { name: EQ2_NAME, base_price: 1000, status: "active", is_demo: true },
      ]),
    });
    if (!eqRes.ok) throw new Error(`장비 시드 실패: ${eqRes.status}`);
    const eqs = (await eqRes.json()) as Array<{ id: string; name: string }>;
    equipmentId = eqs.find((e) => e.name === EQ_NAME)!.id;
    equipmentId2 = eqs.find((e) => e.name === EQ2_NAME)!.id;

    const profRes = await rest("profiles?select=id&limit=1");
    adminId = ((await profRes.json()) as Array<{ id: string }>)[0].id;

    // 기존 예약: EQ 14:00–15:30 (스펙 시나리오의 전제)
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
    await expect(page.getByText(CUSTOMER_SEED).first()).toBeVisible();
    await expect(page.getByText("14:00–15:30 (90분)")).toBeVisible();
  });

  test("다른 장비는 같은 시간대 점유로 막지 않는다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);

    // EQ2만 선택 → 14:00은 EQ 예약뿐이라 점유 아님(선택 가능)
    await page.getByRole("checkbox", { name: EQ2_NAME, exact: true }).check();
    await page.getByRole("button", { name: "90분", exact: true }).click();
    await expect(page.getByRole("button", { name: "14:00", exact: true })).toBeEnabled();

    // EQ도 추가 선택 → 같은 장비 점유로 14:00 비활성
    await page.getByRole("checkbox", { name: EQ_NAME, exact: true }).check();
    await expect(page.getByRole("button", { name: "14:00", exact: true })).toBeDisabled();
  });

  test("같은 장비 13:00+90분 충돌 / 10:00+90분+담당자 → 등록 성공", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);

    // 미등록 고객 직접 입력 + 담당자 지정 + 장비 체크박스 선택
    await page.getByLabel("고객").fill(CUSTOMER_NEW);
    await page.getByLabel("담당자").selectOption({ index: 1 });
    await page.getByRole("checkbox", { name: EQ_NAME, exact: true }).check();
    await page.getByRole("button", { name: "90분", exact: true }).click();

    // 14:00 슬롯은 같은 장비(EQ) 점유로 비활성(취소선)
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
    await expect(page.getByText(CUSTOMER_NEW).first()).toBeVisible();
    await expect(page.getByText("10:00–11:30 (90분)")).toBeVisible();
  });

  test("블록 클릭 → 상세 → 취소 → 같은 장비·같은 시간 재등록 가능", async ({ page }) => {
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

    // 같은 장비·같은 시간대(10:00–11:30) 재등록 — canceled는 EXCLUDE에서 제외되므로 성공해야 함
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);
    await page.getByLabel("고객").fill(`${CUSTOMER_NEW}2`);
    await page.getByRole("checkbox", { name: EQ_NAME, exact: true }).check();
    await page.getByRole("button", { name: "90분", exact: true }).click();
    await page.getByRole("button", { name: "10:00", exact: true }).click();
    await page.getByRole("button", { name: /예약 저장/ }).click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations\\?date=${DATE}`), { timeout: 15_000 });
    await expect(page.getByText(`${CUSTOMER_NEW}2`).first()).toBeVisible();
    await expect(page.getByText("10:00–11:30 (90분)")).toBeVisible();
  });

  test("등록 → 상세 '수정' → 장비·시간 변경 → 목록 반영", async ({ page }) => {
    const EDIT_CUST = "E2E_데모고객_수정";
    await login(page);

    // 1) EQ2로 11:00+60분 등록
    await page.goto(`/admin/demo-reservations/new?date=${DATE}`);
    await page.getByLabel("고객").fill(EDIT_CUST);
    await page.getByRole("checkbox", { name: EQ2_NAME, exact: true }).check();
    await page.getByRole("button", { name: "60분", exact: true }).click();
    await page.getByRole("button", { name: "11:00", exact: true }).click();
    await page.getByRole("button", { name: /예약 저장/ }).click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations\\?date=${DATE}`), { timeout: 15_000 });
    await expect(page.getByText("11:00–12:00 (60분)")).toBeVisible();

    // 2) 블록 → 상세 → 수정
    await page.getByRole("button", { name: /11:00–12:00/ }).click();
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations/[0-9a-f-]+/edit$`), { timeout: 15_000 });

    // 프리필 검증: EQ2 체크됨, 자기 시간(11:00)은 자기-제외라 점유 아님(선택 가능)
    await expect(page.getByRole("checkbox", { name: EQ2_NAME, exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "11:00", exact: true })).toBeEnabled();

    // 3) 장비 EQ 추가 + 시작시간 16:00으로 변경 → 수정 저장
    await page.getByRole("checkbox", { name: EQ_NAME, exact: true }).check();
    await page.getByRole("button", { name: "16:00", exact: true }).click();
    await page.getByRole("button", { name: /수정 저장/ }).click();
    await page.waitForURL(new RegExp(`/admin/demo-reservations\\?date=${DATE}`), { timeout: 15_000 });

    // 4) 16:00–17:00으로 이동, 11:00 사라짐
    await expect(page.getByText("16:00–17:00 (60분)")).toBeVisible();
    await expect(page.getByText("11:00–12:00 (60분)")).toBeHidden();
    await expect(page.getByText(EDIT_CUST).first()).toBeVisible();
  });

  test("같은 시간대 겹치는 예약은 타임라인에 열로 나란히 표시(가림 없음)", async ({ page }) => {
    const DATE2 = "2027-03-03";
    // 다른 장비로 11:00 겹치게 2건 시드(EQ 60분 + EQ2 90분) → 같은 장비 아니라 둘 다 유효.
    await seedReservation("11:00", "12:00", equipmentId, DATE2);
    await seedReservation("11:00", "12:30", equipmentId2, DATE2);
    await login(page);
    await page.goto(`/admin/demo-reservations?date=${DATE2}`);

    // 타임라인 블록 두 개 모두 렌더(시각 라벨에 '(N분)'은 타임라인 전용 → 월간 리스트와 구분)
    const b1 = page.getByRole("button").filter({ hasText: "11:00–12:00 (60분)" });
    const b2 = page.getByRole("button").filter({ hasText: "11:00–12:30 (90분)" });
    await expect(b1).toBeVisible();
    await expect(b2).toBeVisible();

    // 열 분할 검증: 두 블록의 x좌표가 충분히 떨어져 가로로 안 겹친다(나란히).
    const box1 = await b1.boundingBox();
    const box2 = await b2.boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(Math.abs(box1!.x - box2!.x)).toBeGreaterThan(20);
  });
});
