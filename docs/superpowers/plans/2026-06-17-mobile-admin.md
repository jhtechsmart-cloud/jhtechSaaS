# 관리자 모바일 대응 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱(`lg`=1024px 이상)을 건드리지 않고, 그 미만(모바일·태블릿 세로)에서 관리자 콘솔의 핵심 워크플로(견적 작성·수기견적·메일·고객응대)를 쓸 수 있게 레이아웃을 모드 전환형으로 만든다.

**Architecture:** 모든 분기는 Tailwind `lg:` 기준. 데스크톱은 기존 코드 경로 그대로, `lg` 미만에서만 모바일 모드(사이드바→햄버거 드로어, 의뢰관리 2분할→목록↔상세 전환, 견적 합계→하단 고정 바). 전환용 UI 상태(드로어 열림·상세 표시)는 영속 불필요 → 매 로드 기본 상태에서 시작, 쿠키 안 씀(서버·클라 초기값 일치로 hydration mismatch 회피).

**Tech Stack:** Next.js(App Router, 서버/클라 컴포넌트), Tailwind CSS v4, Playwright(E2E·모바일 뷰포트), Vitest(순수 함수 단위).

## Global Constraints

- 분기점 = Tailwind `lg`(1024px). `lg` 이상은 기존 동작 무손상, `lg` 미만만 모바일 모드.
- 전환용 UI 상태는 쿠키/localStorage 금지(매 로드 기본 상태). 영속 필요 상태만 쿠키(이번 작업엔 없음).
- `as any` 0. 컴포넌트에 비즈니스 로직 금지 — 순수 판단 로직은 `lib/`로 분리.
- 커밋 prefix: `feat:` / `fix:` / `refactor:` / `test:`. 한국어 주석.
- 동시 세션 흔함 → 각 Phase는 worktree 격리, 머지 전 `origin/main` 선병합. 시작 시 로컬 main 뒤처지면 `git pull --ff-only`.
- 머지 전 게이트: `web test`·`web typecheck`·`lint`·`build`·`web test:e2e`(클린 `db reset`+`bash supabase/seed/seed-local.sh` 후). 이번 작업은 DB 무변경 → `db push`·`db-tests` 불요(단 e2e는 시드 필요).
- E2E 로그인 시드 계정: `admin@jhtech.local`/`jhtech-admin-dev`, `sales@jhtech.local`/`jhtech-sales-dev`(dashboard.spec.ts 패턴).

---

# Phase 1 — 공통 셸: 햄버거 드로어

**Phase Goal:** `lg` 미만에서 고정 사이드바를 숨기고, 상단바 `☰` 버튼으로 좌측 슬라이드 드로어(기존 메뉴 재사용)를 연다. 데스크톱은 그대로.

**File Structure (Phase 1):**
- Create: `apps/web/src/app/admin/_components/MobileNav.tsx` — 클라 컴포넌트. `☰` 버튼 + 오버레이 드로어(SidebarNav 재사용 + 프로필/로그아웃). 책임: 모바일 네비게이션 전체.
- Modify: `apps/web/src/app/admin/_components/Icon.tsx` — 햄버거(`menu`) 아이콘 path 추가.
- Modify: `apps/web/src/app/admin/_components/AdminSidebar.tsx:46` — 루트 `<aside>`를 `lg` 미만에서 숨김.
- Modify: `apps/web/src/app/admin/layout.tsx:91` — 상단바 좌측에 `<MobileNav>` 렌더.
- Test: `apps/web/e2e/mobile-nav.spec.ts` — 모바일 뷰포트(390px) 드로어 열기·이동·닫힘.

**Interfaces:**
- Consumes: `SidebarNav`(`{ items: NavItem[]; expanded?: boolean }`), `NavItem`(`SidebarNav.tsx`), `Icon`(`{ name; size }`), `signOut`(`@/app/login/actions`).
- Produces: `MobileNav`(`{ items: NavItem[]; isAdmin: boolean }`) — layout 상단바에서 사용.

---

### Task 1.1: 햄버거 아이콘 추가

**Files:**
- Modify: `apps/web/src/app/admin/_components/Icon.tsx:20`

- [ ] **Step 1: `menu` path 추가**

`Icon.tsx`의 `PATHS` 객체에서 `chevronRight` 줄 아래에 한 줄 추가:

```tsx
  chevronRight: "M9 18l6-6-6-6",
  menu: "M3 6h18M3 12h18M3 18h18",
};
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS (에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/_components/Icon.tsx
git commit -m "feat: 콘솔 아이콘에 햄버거(menu) 추가"
```

---

### Task 1.2: MobileNav 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/_components/MobileNav.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Icon } from "./Icon";
import { SidebarNav, type NavItem } from "./SidebarNav";

// 모바일(lg 미만) 전용 네비게이션 — 상단바 ☰ 버튼 + 왼쪽에서 슬라이드되는 오버레이 드로어.
// 데스크톱 고정 사이드바(AdminSidebar)는 lg 미만에서 hidden 처리되므로 그 자리를 대신한다.
// 열림 상태는 전환용(영속 불필요) → 매 로드 닫힘으로 시작, 쿠키 안 씀(hydration 안전).
export function MobileNav({ items, isAdmin }: { items: NavItem[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 경로 변경(메뉴 항목 선택 등) → 드로어 닫기.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* ☰ — 모바일에서만 보임 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-muted lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>

      {/* 드로어 + 배경 — 열렸을 때만 마운트 */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* 배경 탭 → 닫힘 */}
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          {/* 패널 */}
          <aside
            aria-label="모바일 메뉴"
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-sidebar text-sidebar-text shadow-xl"
          >
            <div className="flex items-center gap-2.5 px-3.5 py-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
                <Icon name="dashboard" size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-body font-extrabold tracking-tight text-accent-2">재현테크</span>
                <span className="truncate text-micro text-sidebar-text">견적관리 콘솔</span>
              </span>
            </div>

            <SidebarNav items={items} expanded />

            <div className="mx-3 mb-4 mt-2 flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-3 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-small font-bold text-accent">
                {isAdmin ? "관" : "영"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-small font-semibold text-text">{isAdmin ? "관리자" : "영업담당"}</span>
                <span className="truncate text-micro text-sidebar-text">재현테크</span>
              </span>
              <form action={signOut} className="shrink-0">
                <button className="text-sidebar-text transition-colors hover:text-danger" aria-label="로그아웃" title="로그아웃">
                  <Icon name="logout" size={18} />
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/_components/MobileNav.tsx
git commit -m "feat: 모바일 햄버거 드로어 네비게이션(MobileNav)"
```

---

### Task 1.3: 데스크톱 사이드바 모바일 숨김 + 상단바에 MobileNav 연결

**Files:**
- Modify: `apps/web/src/app/admin/_components/AdminSidebar.tsx:46`
- Modify: `apps/web/src/app/admin/layout.tsx:11,91`

- [ ] **Step 1: AdminSidebar 루트 aside를 lg 미만에서 숨김**

`AdminSidebar.tsx`의 `<aside>` className(46~48행) 맨 앞 `flex`를 `hidden lg:flex`로 교체:

```tsx
      className={`hidden shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-text transition-[width] duration-200 lg:flex ${
        expanded ? "w-56" : "w-16"
      }`}
```

- [ ] **Step 2: layout.tsx에 import 추가**

`layout.tsx:11`(`AdminSidebar` import 아래)에 추가:

```tsx
import { AdminSidebar } from "./_components/AdminSidebar";
import { MobileNav } from "./_components/MobileNav";
```

- [ ] **Step 3: 상단바 좌측에 MobileNav 렌더**

`layout.tsx`의 `<header ...>`(91행) 바로 안쪽, 검색 박스(`<div className="flex max-w-md ...">`) **앞**에 추가:

```tsx
        <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
          <MobileNav items={items.filter((it) => it.show)} isAdmin={isAdmin} />
          <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-muted">
```

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/app/admin/_components/AdminSidebar.tsx
git commit -m "feat: lg 미만에서 고정 사이드바 숨김 + 상단바 햄버거 연결"
```

---

### Task 1.4: E2E — 드로어 열기·이동·닫힘 (모바일 뷰포트)

**Files:**
- Create: `apps/web/e2e/mobile-nav.spec.ts`

- [ ] **Step 1: 실패하는 E2E 작성**

```ts
import { test, expect, type Page } from "@playwright/test";

// 모바일(390px) 햄버거 드로어 — 데스크톱 사이드바는 숨고 ☰로 메뉴 이동.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("모바일 햄버거 드로어", () => {
  test("☰로 드로어 열고 메뉴 이동 + 자동 닫힘", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");

    // 모바일: 드로어 메뉴는 처음엔 안 보임, ☰ 버튼은 보임.
    const drawerNav = page.getByRole("navigation", { name: "모바일 메뉴" });
    await expect(drawerNav).toBeHidden();
    const hamburger = page.getByRole("button", { name: "메뉴 열기" });
    await expect(hamburger).toBeVisible({ timeout: 15_000 });

    // 열기 → 드로어 내 '고객' 링크 보임.
    await hamburger.click();
    await expect(drawerNav).toBeVisible();
    const customers = drawerNav.getByRole("link", { name: "고객" });
    await expect(customers).toBeVisible();

    // 메뉴 선택 → 이동 + 드로어 자동 닫힘.
    await customers.click();
    await expect(page).toHaveURL(/\/admin\/customers/, { timeout: 15_000 });
    await expect(drawerNav).toBeHidden();
  });

  test("배경 탭으로 닫힘", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    const drawerNav = page.getByRole("navigation", { name: "모바일 메뉴" });
    await expect(drawerNav).toBeVisible();
    await page.getByRole("button", { name: "메뉴 닫기" }).click();
    await expect(drawerNav).toBeHidden();
  });
});
```

- [ ] **Step 2: 시드 복구 후 테스트 실행 — 통과 확인**

Run:
```bash
cd apps/web && bash ../../supabase/seed/seed-local.sh && pnpm --filter web test:e2e mobile-nav
```
Expected: 2 passed. (드로어 `aria-label="모바일 메뉴"` 네비게이션이 열림/닫힘에 따라 마운트/언마운트되어 `toBeHidden`/`toBeVisible` 단언이 통과.)

> 참고: `<aside aria-label="모바일 메뉴">`는 ARIA role `complementary`이지만 내부 `<SidebarNav>`가 `<nav>`(role `navigation`)를 렌더하므로 `getByRole("navigation", { name: ... })`이 SidebarNav의 nav에 매칭되지 않을 수 있다. **확실히 하려면** Step 1의 셀렉터를 드로어 패널에 직접 단 test id 또는 `aria-label`로 맞춘다 — SidebarNav의 `<nav>`엔 이름이 없으므로, 드로어 패널 식별은 `page.getByRole("complementary", { name: "모바일 메뉴" })`로 한다. Step 1의 `drawerNav` 정의를 다음으로 교체:
> ```ts
> const drawerNav = page.getByRole("complementary", { name: "모바일 메뉴" });
> ```

- [ ] **Step 3: 데스크톱 회귀 확인 — 기존 e2e 통과**

Run: `pnpm --filter web test:e2e dashboard`
Expected: 기존 대시보드 스펙 전부 통과(데스크톱 뷰포트라 사이드바 정상).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/e2e/mobile-nav.spec.ts
git commit -m "test: 모바일 햄버거 드로어 e2e(열기·이동·닫힘)"
```

**Phase 1 완료 게이트:** `web typecheck`·`lint`·`build`·`web test:e2e` 통과 → PR.

---

# Phase 2 — 의뢰관리: 목록↔상세 전환 (master-detail)

**Phase Goal:** `lg` 미만에서, 목록 라우트(`/admin/applications`)는 목록만 풀화면, 상세 라우트(`/admin/applications/[id]…`)는 상세만 풀화면 + `‹ 목록` 뒤로가기. `lg` 이상은 기존 2분할 유지.

**File Structure (Phase 2):**
- Create: `apps/web/src/lib/applications/is-detail-path.ts` — 순수 함수 `isApplicationDetailPath(pathname)`. 책임: 경로가 상세인지 판정.
- Create: `apps/web/src/app/admin/applications/_components/ApplicationDetailPane.tsx` — 클라. 상세 영역 표시/숨김 + 모바일 `‹ 목록` 링크.
- Modify: `apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx:106` — 목록 aside를 모바일 풀폭 + 상세 열렸을 때 숨김.
- Modify: `apps/web/src/app/admin/applications/layout.tsx:34` — 상세 children을 `ApplicationDetailPane`로 감쌈.
- Test: `apps/web/src/lib/applications/is-detail-path.test.ts`(단위), `apps/web/e2e/mobile-applications.spec.ts`(E2E).

**Interfaces:**
- Produces: `isApplicationDetailPath(pathname: string): boolean`, `ApplicationDetailPane({ children: ReactNode })`.
- Consumes: `usePathname`(next/navigation), `Link`(next/link).

---

### Task 2.1: 순수 함수 `isApplicationDetailPath` (TDD)

**Files:**
- Create: `apps/web/src/lib/applications/is-detail-path.test.ts`
- Create: `apps/web/src/lib/applications/is-detail-path.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from "vitest";
import { isApplicationDetailPath } from "./is-detail-path";

describe("isApplicationDetailPath", () => {
  it("목록 루트는 상세 아님", () => {
    expect(isApplicationDetailPath("/admin/applications")).toBe(false);
    expect(isApplicationDetailPath("/admin/applications/")).toBe(false);
  });
  it("의뢰 id가 붙으면 상세", () => {
    expect(isApplicationDetailPath("/admin/applications/abc-123")).toBe(true);
  });
  it("상세 하위 경로(출고의뢰서 등)도 상세", () => {
    expect(isApplicationDetailPath("/admin/applications/abc-123/release-order")).toBe(true);
  });
  it("다른 화면은 상세 아님", () => {
    expect(isApplicationDetailPath("/admin/dashboard")).toBe(false);
    expect(isApplicationDetailPath("/admin/quotes/new")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test is-detail-path`
Expected: FAIL ("isApplicationDetailPath is not defined" 또는 모듈 없음)

- [ ] **Step 3: 구현**

```ts
// 경로가 의뢰 "상세"(목록 루트 제외)인지 판정한다.
// /admin/applications/<id> 및 그 하위(예: /release-order)면 상세.
export function isApplicationDetailPath(pathname: string): boolean {
  const m = pathname.match(/^\/admin\/applications\/([^/]+)/);
  return m != null && m[1].length > 0;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web test is-detail-path`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/applications/is-detail-path.ts apps/web/src/lib/applications/is-detail-path.test.ts
git commit -m "feat: 의뢰 상세경로 판정 순수함수 + 단위테스트"
```

---

### Task 2.2: ApplicationDetailPane + 목록 aside 반응형 + layout 연결

**Files:**
- Create: `apps/web/src/app/admin/applications/_components/ApplicationDetailPane.tsx`
- Modify: `apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx:106`
- Modify: `apps/web/src/app/admin/applications/layout.tsx`

- [ ] **Step 1: ApplicationDetailPane 작성**

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isApplicationDetailPath } from "@/lib/applications/is-detail-path";

// 의뢰 상세 영역 래퍼 — 모바일(lg 미만)에선 상세 라우트일 때만 표시 + ‹ 목록 뒤로가기.
// lg 이상에선 항상 표시(기존 2분할 우측 칸 그대로).
export function ApplicationDetailPane({ children }: { children: ReactNode }) {
  const detail = isApplicationDetailPath(usePathname());
  return (
    <div className={`${detail ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
      {detail && (
        <Link
          href="/admin/applications"
          className="flex items-center gap-1 border-b border-border px-4 py-2.5 text-small font-semibold text-accent lg:hidden"
        >
          ‹ 목록
        </Link>
      )}
      {/* 상세 자체 스크롤 칸 — 하단 pb-16으로 저장/취소 버튼 아래 여백 */}
      <div className="min-w-0 flex-1 overflow-y-auto px-6 pt-6 pb-16">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 목록 aside를 모바일 풀폭 + 상세 시 숨김**

`ApplicationListPane.tsx:106`의 `<aside>` className을 교체.
- 변경 전: `className="flex w-[300px] shrink-0 flex-col border-r border-border bg-surface"`
- 변경 후(파일 상단 `activeId`가 이미 계산됨 — 그 값으로 모바일 숨김):

```tsx
    <aside className={`${activeId ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-surface lg:w-[300px]`}>
```

- [ ] **Step 3: layout.tsx에서 children을 ApplicationDetailPane로 감쌈**

`applications/layout.tsx`:
- import 추가(`ApplicationListPane` import 아래):
```tsx
import { ApplicationListPane } from "./_components/ApplicationListPane";
import { ApplicationDetailPane } from "./_components/ApplicationDetailPane";
```
- return의 우측 `<div ...>{children}</div>`(34행)를 교체:
```tsx
    <div className="flex h-[calc(100dvh-57px)]">
      <ApplicationListPane
        initialRows={first.rows}
        initialHasMore={first.hasMore}
        counts={counts}
        canQuote={can(access.permissions, "quotes.write")}
      />
      <ApplicationDetailPane>{children}</ApplicationDetailPane>
    </div>
```

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/applications/
git commit -m "feat: 의뢰관리 모바일 목록↔상세 전환(lg 미만)"
```

---

### Task 2.3: E2E — 목록→상세→뒤로 (모바일 뷰포트)

**Files:**
- Create: `apps/web/e2e/mobile-applications.spec.ts`

- [ ] **Step 1: 실패 E2E 작성**

> 전제: 시드에 의뢰가 최소 1건 있어야 한다. `request.spec.ts`/`quotes.spec.ts`가 공개 폼으로 의뢰를 생성하는 패턴을 쓰므로, 목록이 비어 있으면 이 테스트는 **공개 의뢰 폼으로 1건 생성 후** 진행한다(아래 `ensureOneApplication` 참고). 기존 `applications.spec.ts`의 생성 헬퍼가 있으면 재사용한다.

```ts
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe.serial("모바일 의뢰관리 목록↔상세", () => {
  test("목록에서 항목 탭 → 상세 전환 → ‹ 목록 복귀", async ({ page }) => {
    await login(page);
    await page.goto("/admin/applications");

    // 목록의 첫 의뢰 링크(없으면 스킵 — 시드 상태에 따라).
    const firstItem = page.locator('a[href^="/admin/applications/"]').first();
    if ((await firstItem.count()) === 0) test.skip(true, "시드에 의뢰 없음");
    await expect(firstItem).toBeVisible({ timeout: 15_000 });

    // 탭 → 상세 라우트 + ‹ 목록 뒤로가기 보임.
    await firstItem.click();
    await expect(page).toHaveURL(/\/admin\/applications\/[^/]+/, { timeout: 15_000 });
    const back = page.getByRole("link", { name: "‹ 목록" });
    await expect(back).toBeVisible();

    // 뒤로가기 → 목록 루트.
    await back.click();
    await expect(page).toHaveURL(/\/admin\/applications$/, { timeout: 15_000 });
  });
});
```

- [ ] **Step 2: 시드 복구 후 실행 — 통과 확인**

Run:
```bash
cd apps/web && bash ../../supabase/seed/seed-local.sh && pnpm --filter web test:e2e mobile-applications
```
Expected: 1 passed(시드에 의뢰 있으면) 또는 skipped(없으면). 시드에 의뢰가 없다면 Step 1의 주석대로 생성 헬퍼를 추가해 통과로 만든다.

- [ ] **Step 3: 데스크톱 회귀 — 기존 의뢰 스펙 통과**

Run: `pnpm --filter web test:e2e applications`
Expected: 기존 `applications.spec.ts` 전부 통과(데스크톱 뷰포트라 2분할 정상).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/e2e/mobile-applications.spec.ts
git commit -m "test: 모바일 의뢰관리 목록↔상세 전환 e2e"
```

**Phase 2 완료 게이트:** `web test`(단위)·`web typecheck`·`lint`·`build`·`web test:e2e` 통과 → PR.

---

# Phase 3~5 — 착수 직전 상세화(JIT)

아래 3개 Phase는 각각 독립 PR이며, **해당 worktree를 만들 때 이 plan에 TDD 태스크를 추가**한다(`writing-plans` 재호출). 이유: ① 견적 프레임·대시보드·고객 상세 컴포넌트는 동시 세션이 자주 건드려 지금 줄번호/코드를 고정하면 금세 stale. ② 착수 시점에 실제 코드를 읽어 정확한 diff를 잡는 편이 품질이 높다. 각 Phase의 **목표·대상 파일·접근·테스트 의도**는 아래로 확정한다.

### Phase 3 — 견적 작성: 하단 고정 합계 바
- **목표**: `lg` 미만에서 화면 하단에 `공급가 ₩×××  [발행/저장]` 고정 바. 데스크톱 우측 sticky 320px 요약은 그대로.
- **대상 파일**: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/*`(QuoteSummaryPanel 영역), `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx`(+`QuoteTotalsAside`), `QuoteLinesEditor`.
- **접근**: 공급가 표시는 `supply_price`(VAT 별도, CLAUDE.md E8 화면표시 통일) 재사용. 하단 바(`fixed bottom-0 lg:hidden`)는 흐름 안 주 액션과 **같은 핸들러** 호출(중복 버튼 금지). 줄 편집기 가로 넘침은 실제 컴포넌트 확인 후 가로 스크롤 래퍼 또는 카드형.
- **테스트**: 금액 포맷은 기존 shared 순수함수 재사용(새 단위 불필요할 수 있음). E2E(390px): 작성 화면에서 하단 바에 공급가 보임 → 발행 동작.

### Phase 4 — 대시보드: 캘린더·차트 가로 넘침
- **목표**: `lg` 미만에서 2주 캘린더·주간 차트가 뭉개지지 않게.
- **대상 파일**: `apps/web/src/app/admin/dashboard/_components/TwoWeekCalendar.tsx`, `WeeklyUnitChart.tsx`(착수 시 현재 구조 재확인 — dashboard.spec.ts 기준 "일반 달력" 형태로 이미 바뀌었을 수 있음).
- **접근(기본)**: 7열 그리드를 `overflow-x-auto` 래퍼 + 셀 `min-w`로 감싸 가로 스크롤. **검토 대안**: 모바일에선 "다가오는 일정 리스트"(agenda). 착수 시 데이터 구조 보고 최종 결정 — 결정과 근거를 plan에 기록.
- **테스트**: E2E(390px): 대시보드 진입 → 가로 스크롤로 캘린더/차트 접근 가능, 레이아웃이 뷰포트 밖으로 깨지지 않음(`document.scrollingElement` 가로 넘침이 래퍼 내부에 한정).

### Phase 5 — 메일 모달 + 고객 상세 폴리시
- **목표**: 이미 거의 대응된 두 화면의 모바일 마감.
- **대상 파일**: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/SendQuoteEmailModal.tsx`, `apps/web/src/app/admin/customers/[id]/_components/CustomerInfoSidebar.tsx`·`CustomerHeader.tsx`.
- **접근**: 메일 모달 textarea가 키보드에 가리지 않게 높이/스크롤 조정(이미 `w-full max-w-lg p-4`). `CustomerInfoSidebar`의 `FieldRow`(라벨 `w-24` + 우정렬 값) 긴 값 줄바꿈/말줄임.
- **테스트**: E2E(390px): 메일 모달 열림·입력 가능·발송 버튼 접근. 고객 상세 진입 시 가로 넘침 없음.

---

## Self-Review (작성자 점검)

- **Spec 커버리지**: 모바일 spec의 5개 Phase 모두 plan에 대응(1·2 상세, 3·5 JIT 확정 항목). 출고의뢰서는 범위 밖(그 세션 spec에 조항 추가 완료) — plan에서도 제외 일치.
- **플레이스홀더**: Phase 1·2는 실제 코드/경로/명령 포함, "TODO/TBD" 없음. Phase 3~5는 "나중에"가 아니라 **JIT 상세화 + 목표·파일·접근·테스트 확정**으로 명시(의도된 분할, 근거 기재).
- **타입/이름 일관성**: `isApplicationDetailPath`(2.1 정의 → 2.2 소비), `MobileNav({items,isAdmin})`(1.2 정의 → 1.3 소비), `ApplicationDetailPane({children})`(2.2 정의 → layout 소비) 일치. `NavItem`은 기존 `SidebarNav` export 재사용.
- **E2E 셀렉터 리스크**: 1.4의 드로어 식별은 `complementary`(aside aria-label) 권장(SidebarNav `<nav>`엔 이름 없음) — Step 2 참고 박스에 명시.

---

# Phase 3 — 견적 하단 고정 합계 바 (JIT 확정)

**Phase Goal:** `lg` 미만에서 견적 작성(`QuoteForm`)·수기견적(`ManualQuoteForm`) 화면 하단에 `공급가 ₩××× [임시저장][발행하기]` 고정 바를 띄운다. 데스크톱(`lg`+)은 우측 sticky 요약(`QuoteTotalsAside`) 그대로, 하단 바 없음.

**근거(코드 매핑):** 두 폼 모두 `'use client'`이며 `totals.supplyPrice`(인라인 계산, state 기반)·`submit("draft"|"issued")`·`pending`을 같은 컴포넌트 클로저에 보유 → 하단 바를 공용 컴포넌트로 빼고 prop만 넘기면 중복 로직 0. 줄 편집기(`QuoteLinesEditor`)는 `flex-wrap`이라 가로 스크롤 없음(좁으면 줄 내림) → 별도 처리 불필요.

**File Structure (Phase 3):**
- Create: `apps/web/src/app/admin/_components/QuoteBottomBar.tsx` — 공용 하단 바(프레젠테이션, prop으로 합계·핸들러 수신).
- Modify: `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx` — 하단 바 렌더 + 그리드에 모바일 하단 여백.
- Modify: `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx` — 동일.
- Modify: `apps/web/src/app/admin/_components/QuoteTotalsAside.tsx` — `lg` 미만에서 숨김(하단 바와 중복 제거).
- Test: `apps/web/e2e/mobile-quote-bar.spec.ts`.

**Interfaces:**
- Produces: `QuoteBottomBar({ supplyPrice: number; pending: boolean; onSave: () => void; onIssue: () => void })`.

---

### Task 3.1: QuoteBottomBar 공용 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/_components/QuoteBottomBar.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

// 견적 작성 화면 하단 고정 바(lg 미만 전용). 데스크톱 우측 sticky 요약(QuoteTotalsAside)은 그대로.
// 합계·핸들러·pending은 상위 폼('use client')에서 prop으로 받아 재사용 → 중복 로직 없음.
export function QuoteBottomBar({
  supplyPrice,
  pending,
  onSave,
  onIssue,
}: {
  supplyPrice: number;
  pending: boolean;
  onSave: () => void;
  onIssue: () => void;
}) {
  return (
    <div
      data-testid="quote-bottom-bar"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,.08)] lg:hidden"
    >
      <span className="min-w-0 truncate text-body font-semibold text-text">
        공급가 <span className="tabular-nums">{supplyPrice.toLocaleString("ko-KR")}</span>원
        <span className="ml-1 text-micro font-normal text-muted">VAT 별도</span>
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-surface-2 px-3 py-2 text-small font-semibold text-text disabled:opacity-50"
        >
          임시저장
        </button>
        <button
          type="button"
          onClick={onIssue}
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-small font-semibold text-white disabled:opacity-50"
        >
          발행하기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/_components/QuoteBottomBar.tsx
git commit -m "feat: 견적 작성 모바일 하단 고정 합계 바(QuoteBottomBar)"
```

---

### Task 3.2: 두 폼에 하단 바 연결 + 모바일 여백 + 우측 요약 숨김

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx`
- Modify: `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx`
- Modify: `apps/web/src/app/admin/_components/QuoteTotalsAside.tsx`

- [ ] **Step 1: QuoteForm.tsx — import + 하단 바 + 그리드 여백**

상단 import 블록에 추가:
```tsx
import { QuoteBottomBar } from "@/app/admin/_components/QuoteBottomBar";
```
그리드 div(82번 줄 부근 `<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">`)의 className에 모바일 하단 여백 추가(고정 바에 가려지지 않게):
```tsx
<div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[1fr_320px] lg:pb-0">
```
그리드 div가 닫힌 직후(같은 return 안, 그리드의 형제로) 하단 바 추가:
```tsx
      <QuoteBottomBar
        supplyPrice={totals.supplyPrice}
        pending={pending}
        onSave={() => submit("draft")}
        onIssue={() => submit("issued")}
      />
```
(`totals`·`pending`·`submit`은 이미 이 컴포넌트 스코프에 존재 — 매핑 59/61번 줄. return 루트가 단일 요소면 fragment `<>...</>`로 감싸 그리드와 바를 형제로 둔다.)

- [ ] **Step 2: ManualQuoteForm.tsx — 동일 적용**

import 추가(동일). 그리드 div(67번 줄 부근) className에 `pb-24 ... lg:pb-0` 동일 추가. 그리드 닫힌 직후 동일한 `<QuoteBottomBar .../>` 추가(`totals`·`pending`·`submit`은 32/34번 줄에 존재).

- [ ] **Step 3: QuoteTotalsAside.tsx — lg 미만 숨김**

18번 줄 `<div className="self-start lg:sticky lg:top-0">`을 모바일 숨김으로:
```tsx
<div className="hidden self-start lg:block lg:sticky lg:top-0">
```
(모바일에선 하단 바가 합계·액션을 제공하므로 우측 요약 숨김 → 중복 제거.)

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/applications/\[id\]/_components/QuoteForm.tsx apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx apps/web/src/app/admin/_components/QuoteTotalsAside.tsx
git commit -m "feat: 견적 작성 두 폼에 모바일 하단 바 연결 + 우측 요약 모바일 숨김"
```

---

### Task 3.3: E2E — 모바일 하단 바 (수기견적 화면)

**Files:**
- Create: `apps/web/e2e/mobile-quote-bar.spec.ts`

수기견적(`/admin/quotes/new`)은 의뢰 시드 없이 단독 접근 가능 → 가장 단순한 검증 화면. 데이터 생성(발행) 없이 레이아웃·합계 반영만 검증(발행 흐름은 quotes.spec.ts가 데스크톱서 이미 커버).

- [ ] **Step 1: 실패 E2E 작성**

```ts
import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.describe.serial("모바일 견적 하단 고정 바", () => {
  test("모바일: 하단 바 노출 + 공급가 반영, 데스크톱: 숨김", async ({ page }) => {
    await login(page);

    // 모바일 뷰포트
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/quotes/new");

    const bar = page.getByTestId("quote-bottom-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(bar.getByText("공급가")).toBeVisible();
    // 바 안의 발행하기 버튼 존재
    await expect(bar.getByRole("button", { name: "발행하기" })).toBeVisible();

    // 장비 단가 입력 → 바의 공급가 숫자에 반영
    await page.getByLabel("장비 단가").fill("1000000");
    await page.getByLabel("장비 수량").fill("1");
    await expect(bar).toContainText("1,000,000");

    // 데스크톱 뷰포트로 넓히면 하단 바 숨김
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });
});
```

- [ ] **Step 2: 시드 후 실행 — 통과 확인**

Run(from apps/web): `bash ../../supabase/seed/seed-local.sh && pnpm --filter web test:e2e mobile-quote-bar`
Expected: 1 passed. (`supabase db reset` 금지 — 공유 인스턴스.)

- [ ] **Step 3: 데스크톱 회귀 — 견적 작성 스펙 통과**

Run: `pnpm --filter web test:e2e quotes`
Expected: 기존 `quotes.spec.ts` 통과(데스크톱 뷰포트, 우측 요약·발행 정상).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/e2e/mobile-quote-bar.spec.ts
git commit -m "test: 모바일 견적 하단 고정 바 e2e(노출·합계반영·데스크톱 숨김)"
```

**Phase 3 완료 게이트:** `web test`·`web typecheck`·`lint`·`build`·`web test:e2e` 통과.

---

# Phase 4 — 대시보드 캘린더·차트 가로 넘침 (JIT 확정 · 구현 완료)

**결정:** 가로 스크롤 래퍼 + min-width (agenda 리스트 대안은 보류 — 가로 스크롤이 디자인 유지·구현 단순). `lg`+ 데스크톱은 그리드가 컨테이너를 채워 스크롤 없음(무손상).

**변경:**
- `TwoWeekCalendar.tsx`: 그리드 래퍼 `overflow-hidden` → `overflow-x-auto` + `data-testid="calendar-scroll"`, 내부 그리드 `min-w-[680px]`(7칸 가독성 유지).
- `WeeklyUnitChart.tsx`: 7열 그리드를 `overflow-x-auto`(`data-testid="weekly-chart-scroll"`) 래퍼로 감싸고 그리드 `min-w-[480px]`.
- E2E `mobile-dashboard.spec.ts`(390px): 캘린더·차트가 뷰포트 안 스크롤 컨테이너에 담김(scrollWidth > clientWidth, clientWidth ≤ viewport).

KPI 카드·우측 레일은 이미 반응형이라 무변경.

---

# Phase 5 — 메일 모달 폴리시 (JIT 확정 · 구현 완료)

**범위 축소(실측):** 고객 상세(`CustomerInfoSidebar`·`CustomerHeader`)는 **이미 반응형**으로 잘 처리됨(긴 값 `wrap` 여러 줄·짧은 값 `truncate`+`title` 툴팁·헤더 `flex-wrap`·페이지 `grid-cols-1` 스택) → YAGNI로 무변경. Phase 5는 메일 모달 1건으로 좁힘.

**변경:**
- `SendQuoteEmailModal.tsx`: 모달 패널에 `max-h-[90dvh] overflow-y-auto`(+ `data-testid="mail-modal-panel"`) 추가 — 키보드가 올라오거나 짧은 화면에서 모달이 뷰포트를 넘겨 '발송' 버튼이 가려지던 것을, 패널이 뷰포트 안에 갇히고 내부 스크롤로 도달 가능하게.
- E2E `mobile-mail-modal.spec.ts`(390×480, 키보드 상황 모사): 발행 견적 시드 → 모달 열기 → 패널 clientHeight ≤ viewport(갇힘) + scrollHeight > clientHeight(스크롤) + '발송' 클릭 도달 → '메일 발송 중…' 배지.

**모바일 대응 완료:** Phase 1~5 전부 머지(1·2·3=#143, 4=#144) 또는 본 PR(5).
