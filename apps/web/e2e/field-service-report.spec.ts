import { test, expect, type Page } from "@playwright/test";

// 현장 서비스 리포트(/field) e2e (#228 Part 3):
//  1) 미인증 /field 접근 → /login?next= → 로그인 후 원래 화면 복귀
//  2) 기사(write 전용) 계정으로 8단계 마법사 완주: 직접입력 고객·장비 → 고장분류 → 조치 →
//     청구(유상) → 서명 잠금 뷰(캔버스 드로잉) → 기사 최종 확정 → 완료 화면(SR 번호)
//  3) 권한 없는 계정은 /field 안내 화면
// 모바일 뷰포트(390×844)로 실행 — 하단 고정 내비·잠금 뷰 동작 확인.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ENG_EMAIL = "e2e-field-eng@jhtech.test";
const ENG_PASSWORD = "fieldEng1234";
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";
const CUSTOMER = "E2E현장고객상사";

test.use({ viewport: { width: 390, height: 844 } });

function svc(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

async function deleteAuthUserByEmail(email: string) {
  const res = await svc("/auth/v1/admin/users?per_page=1000").catch(() => null);
  if (!res || !res.ok) return;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (body.users ?? []).find((x) => x.email === email);
  if (u) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" }).catch(() => {});
}

// 기사 계정(write 전용) + 테스트 데이터 정리
async function seedEngineer(): Promise<void> {
  await deleteAuthUserByEmail(ENG_EMAIL);
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: ENG_EMAIL, password: ENG_PASSWORD, email_confirm: true }),
  });
  const user = (await created.json()) as { id: string };
  await svc(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      permissions: ["service_reports.write"],
      name: "E2E홍기사",
      position: "기술팀",
      must_change_password: false,
      is_active: true,
    }),
  });
}

async function cleanupData() {
  // 리포트(테스트 고객 명의) → 고객 순 삭제. 스토리지 객체는 로컬이라 잔존 무해.
  await svc(`/rest/v1/service_reports?customer_name=eq.${encodeURIComponent(CUSTOMER)}`, {
    method: "DELETE",
  }).catch(() => {});
  await svc(`/rest/v1/companies?name=eq.${encodeURIComponent(CUSTOMER)}`, { method: "DELETE" }).catch(
    () => {},
  );
}

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

test.beforeAll(async () => {
  await seedEngineer();
  await cleanupData();
});
test.afterAll(async () => {
  await cleanupData();
  await deleteAuthUserByEmail(ENG_EMAIL);
});

test("미인증 /field → login?next → 마법사 완주 → 서명 → 확정", async ({ page }) => {
  // 1) 미인증 접근 → next 파라미터로 복귀
  await page.goto("/field");
  await page.waitForURL(/\/login\?next=%2Ffield/, { timeout: 20_000 });
  await login(page, ENG_EMAIL, ENG_PASSWORD);
  await page.waitForURL(/\/field$/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "+ 새 리포트 작성" })).toBeVisible();

  // 2) 새 리포트 — 1단계: 직접 입력 고객
  await page.getByRole("link", { name: "+ 새 리포트 작성" }).click();
  await page.getByRole("tab", { name: "직접 입력" }).click();
  await page.getByLabel("고객명 *").fill(CUSTOMER);
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "장비 정보", level: 1 })).toBeVisible();

  // 2단계: 장비 직접 입력(보유장비 없음)
  await page.getByRole("button", { name: "+ 등록되지 않은 장비 직접 입력" }).click();
  await page.getByLabel("장비명 *").fill("E2E UV 평판 프린터");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "점검·고장 내역", level: 1 })).toBeVisible();

  // 3단계: 고장분류 1개 + 진단(프리픽스 자동 삽입 확인)
  await page.getByRole("button", { name: "전기·제어", exact: false }).first().click();
  await page.getByRole("button", { name: "접촉불량", exact: true }).click();
  const diag = page.getByLabel("점검 내역");
  await expect(diag).toHaveValue(/\[접촉불량\]/);
  await diag.fill("[접촉불량] SSR 접촉부 확인");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "조치·수리 내역", level: 1 })).toBeVisible();

  // 4단계: 조치
  await page.getByLabel("조치 내역").fill("재납땜 후 정상");
  await page.getByRole("button", { name: "다음" }).click();

  // 5단계(조치 완료 기본)·6단계(부품 없음) 통과 — 단계 전환은 URL 내비게이션이라 헤딩 대기 필수
  await expect(page.getByRole("heading", { name: "향후 일정", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "교체 부품", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "청구 내역", level: 1 })).toBeVisible();

  // 7단계: 유상 + 출장비 입력(천단위 구분 확인)
  await page.getByLabel("출장비", { exact: true }).fill("90000");
  await expect(page.getByLabel("출장비", { exact: true })).toHaveValue("90,000");
  await expect(page.getByText("99,000원")).toBeVisible(); // 총액 = 90,000 + VAT 9,000
  await page.getByRole("button", { name: "다음" }).click();

  // 8단계: 요약 → 서명 잠금 뷰(고객 핸드오프)
  await expect(page.getByText("리포트 요약", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "리포트 확정" })).toBeDisabled(); // 서명 전 비활성
  await page.getByRole("button", { name: "고객 확인 요청 (서명 받기)" }).click();
  await expect(page.getByText("총 청구액", { exact: false })).toBeVisible();

  // 캔버스 서명(경로 길이 ≥100px 드로잉)
  const canvas = page.getByLabel("고객 서명 입력");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("서명 캔버스 없음");
  await page.mouse.move(box.x + 30, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 60, { steps: 12 });
  await page.mouse.move(box.x + 280, box.y + 110, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("서명이 입력되었습니다")).toBeVisible();
  await page.getByRole("button", { name: "서명 완료" }).click();

  // 기사 화면 복귀 → 최종 확정(2단)
  await expect(page.getByText("✓ 고객 서명 완료")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "리포트 확정" }).click();

  // 완료 화면 — SR 번호·수정불가 안내(PDF는 로컬 워커 미가동이라 '생성 중' 허용)
  await expect(page.getByText("리포트가 확정되었습니다")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/SR-\d{8}-\d{5,}/)).toBeVisible();
  await expect(page.getByText("확정된 리포트는 수정할 수 없습니다")).toBeVisible();
});

test("권한 없는 계정(영업)은 /field 안내 화면", async ({ page }) => {
  await page.goto("/field");
  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await login(page, SALES_EMAIL, SALES_PASSWORD);
  await page.waitForURL(/\/field/, { timeout: 20_000 });
  await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
});
