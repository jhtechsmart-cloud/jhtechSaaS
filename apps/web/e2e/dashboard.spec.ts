import { test, expect, type Page } from "@playwright/test";

// 대시보드 v2 E2E — 데이터 상태에 무관하게 안정적으로 검증한다(시드 불요).
//  A) 로그인 후 첫화면이 /admin/dashboard 이고 h1 "대시보드"가 보인다.
//  B) v2 골격 4종(KPI '처리 대기'·2주 일정·견적 파이프라인·주간 활동·일정 레일)이 렌더된다.
//  C) 영업 계정 로그인 → 본인 스코프 라벨("내 담당") 노출(RLS 분기 확인).
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const SALES_EMAIL = process.env.E2E_SALES_EMAIL ?? "sales@jhtech.local";
const SALES_PASSWORD = process.env.E2E_SALES_PASSWORD ?? "jhtech-sales-dev";

async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("대시보드 v2 E2E", () => {
  test("로그인 후 첫화면 = /admin/dashboard + 헤딩 노출", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/admin\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible({ timeout: 15_000 });
  });

  test("v2 골격 — KPI·2주 일정·파이프라인·주간 활동·일정 레일 렌더", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await expect(page.getByText("처리 대기")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("진행 중 견적")).toBeVisible();
    await expect(page.getByText("이번 주 데모·납품")).toBeVisible();
    await expect(page.getByText("전체 고객")).toBeVisible();
    await expect(page.getByText("일정", { exact: true })).toBeVisible();
    // 뷰 토글(1주/2주/월) + 이전/오늘/다음 이동 컨트롤
    await expect(page.getByRole("group", { name: "캘린더 표시 단위" })).toBeVisible();
    await expect(page.getByRole("link", { name: "이전" })).toBeVisible();
    await expect(page.getByRole("link", { name: "다음" })).toBeVisible();
    // 일반 달력 형태 — 범위 라벨("2026년 6월…" 등) + 요일 헤더
    await expect(page.getByText(/^\d{4}년 \d{1,2}월/)).toBeVisible();
    await expect(page.getByText("수", { exact: true })).toBeVisible();
    await expect(page.getByText("일", { exact: true })).toBeVisible();
    await expect(page.getByText("견적 파이프라인")).toBeVisible();
    await expect(page.getByText("주간 활동")).toBeVisible();
    await expect(page.getByText("데모 및 납품 일정")).toBeVisible();
    await expect(page.getByRole("link", { name: "예약 관리 →" })).toBeVisible();
    // 파이프라인 8단계 행(견적 목록 필터 링크) — 라이프사이클 확장(계약완료·수금중·수금완료·종료)
    for (const label of ["접수", "배정", "견적중", "견적발송", "계약완료", "수금중", "수금완료", "종료"]) {
      await expect(
        page.getByRole("link", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }
  });

  test("영업 계정 → 본인 스코프 라벨('내 담당') 표시", async ({ page }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto("/admin/dashboard");
    await expect(page.getByText("내 담당 현황과 일정을 한눈에")).toBeVisible({ timeout: 15_000 });
  });

  test("캘린더 뷰 전환·이동 — 월 뷰 + 다음 이동", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await expect(page.getByText("일정", { exact: true })).toBeVisible({ timeout: 15_000 });
    // 월 뷰 전환 → URL 반영 + 라벨이 "YYYY년 M월"
    await page.getByRole("link", { name: "월", exact: true }).click();
    await expect(page).toHaveURL(/calView=month/);
    await expect(page.getByText(/^\d{4}년 \d{1,2}월$/)).toBeVisible();
    // 다음(달) 이동 → 앵커 쿼리 반영
    await page.getByRole("link", { name: "다음" }).click();
    await expect(page).toHaveURL(/calView=month&calAnchor=\d{4}-\d{2}-\d{2}/);
  });

  test("캘린더 범례 토글 — 항목 숨김 + 새로고침 후 유지(쿠키)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");

    // 범례는 클릭 가능한 버튼(role=button) — KPI 텍스트와 구분됨. 기본은 켜짐(aria-pressed=true).
    const delivery = page.getByRole("button", { name: "납품" });
    await expect(delivery).toBeVisible({ timeout: 15_000 });
    await expect(delivery).toHaveAttribute("aria-pressed", "true");

    // 클릭 → 꺼짐 + 쿠키에 기록.
    await delivery.click();
    await expect(delivery).toHaveAttribute("aria-pressed", "false");
    const cookie = (await page.context().cookies()).find((c) => c.name === "jh.dashCalHidden");
    expect(cookie?.value).toContain("delivery");

    // 새로고침해도 꺼짐 유지(서버가 쿠키 읽어 초기값 주입).
    await page.reload();
    await expect(page.getByRole("button", { name: "납품" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // 복구 — 다시 켜서 다른 테스트 오염 방지.
    await page.getByRole("button", { name: "납품" }).click();
    await expect(page.getByRole("button", { name: "납품" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
