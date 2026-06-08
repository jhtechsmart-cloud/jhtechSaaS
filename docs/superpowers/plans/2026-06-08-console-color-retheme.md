# 콘솔 색 재단장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 콘솔 전체 색을 v3 소프트 인디고에서 딥네이비+스틸블루 모노톤 팔레트로 교체한다(구조·기능 불변).

**Architecture:** `globals.css`의 `@theme` 토큰 **값만 교체**(이름 유지)로 토큰 기반 유틸을 자동 반영시키고, 라이트→다크로 뒤집히는 사이드바(`admin/layout.tsx`)만 클래스를 직접 조정한다. 상태 색 스파인은 불변. 검증은 기존 게이트 무회귀 + 콘솔 전 페이지 시각 점검.

**Tech Stack:** Next.js(App Router) + Tailwind v4(`@theme`) + CSS 변수 토큰.

> ⚠️ 색 작업은 단위테스트로 검증 불가 → 각 태스크의 "테스트"는 **기존 스위트 무회귀 + 빌드 + 육안 확인**이다. 가짜 테스트를 만들지 않는다.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `apps/web/src/app/globals.css` | 디자인 토큰 정의(`@theme`) | 토큰 값 교체 |
| `apps/web/src/app/admin/layout.tsx` | 콘솔 셸(사이드바+상단바) | 사이드바 다크 반전 클래스 |
| `apps/web/src/app/admin/_components/SidebarNav.tsx` | nav 링크 + active 표시 | **신규**(클라 컴포넌트, usePathname) |
| `DESIGN.md` | 디자인 단일 출처 | Color/Layout + Decisions Log |

---

## Task 1: globals.css 토큰 값 교체

**Files:**
- Modify: `apps/web/src/app/globals.css:15-55` (`@theme` 색·그림자 토큰)

- [ ] **Step 1: `@theme`의 색/그림자 토큰 값 교체**

`globals.css`에서 아래 블록(현재 줄 15~37 + 52~55)을 다음으로 교체. **토큰 이름·주석 키는 유지, 값만 새 팔레트로.**

```css
  /* 브랜드/액센트 — 딥네이비+스틸블루 모노톤(2026-06-08 색 재단장). */
  --color-navy: #0B1F3A;        /* 사이드바·배너 — 딥 네이비(흰 텍스트) */
  --color-navy-2: #1F3B5C;      /* 네이비 위 hover/raised(스틸블루) */
  --color-navy-3: #2E4E73;      /* 네이비 위 active */
  --color-accent: #1F3B5C;      /* 기본색: 스틸블루(버튼·active·아이콘칩·배지) */
  --color-accent-2: #2E4E73;    /* 보조: 더 밝은 스틸 하이라이트 */
  --color-accent-soft: #E2E8F1; /* 스틸 틴트: 아이콘칩·active 배경 */
  --color-accent-ring: #C3CEDC; /* 스틸 링/테두리 */

  /* 중립(쿨톤 그레이) */
  --color-bg: #E6E9EF;          /* 앱 배경 — 라이트 그레이 */
  --color-sidebar: #0B1F3A;     /* 사이드바 — 딥 네이비(다크 반전) */
  --color-sidebar-text: #A7B1BE;/* 사이드바 nav 라벨 — 다크 위 쿨그레이 */
  --color-surface: #ffffff;     /* 카드 */
  --color-surface-2: #EEF1F6;   /* 카드 위 트랙·hover */
  --color-border: #D6DBE4;
  --color-text: #2B2F36;        /* 본문 글자(차콜) */
  --color-muted: #667285;       /* 흐린 글자(AA 충족) */
```

그리고 그림자(현재 줄 52~55) 틴트를 네이비 `11 31 58`로 교체:

```css
  --shadow-card: 0 1px 2px 0 rgb(11 31 58 / 0.05), 0 6px 16px -4px rgb(11 31 58 / 0.10);
  --shadow-card-hover: 0 2px 4px 0 rgb(11 31 58 / 0.07), 0 10px 24px -6px rgb(11 31 58 / 0.14);
```

`--color-active`(#16a34a)·`--color-inactive`(#64748b)·`--color-danger`(#dc2626)·타이포·radius는 **그대로 둔다**.

- [ ] **Step 2: 빌드 + 무회귀 확인**

Run: `pnpm --filter @jhtechsaas/web build && pnpm --filter @jhtechsaas/web test --run`
Expected: 빌드 성공, 기존 web 테스트 전부 PASS(색 변경이라 로직 영향 없어야 함).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: 콘솔 디자인 토큰 값 교체 — 딥네이비+스틸블루 모노톤"
```

---

## Task 2: 사이드바 다크 반전 (layout.tsx)

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx:67-111` (사이드바 영역)

라이트 전제 클래스가 다크 네이비 위에서 안 보이므로 글자/hover/프로필 톤을 조정한다. (nav 링크는 Task 3에서 별도 컴포넌트로 빠지므로 여기선 aside 컨테이너·브랜드·프로필만.)

- [ ] **Step 1: aside 컨테이너 주석·클래스**

`layout.tsx:67-68` 교체:

```tsx
      {/* 사이드바 — 딥 네이비(다크). 글자=라이트 */}
      <aside className="flex w-[224px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-text">
```

- [ ] **Step 2: 브랜드 워드마크 라이트화**

`layout.tsx:73-76`의 두 span 색을 교체:

```tsx
          <span className="flex flex-col leading-tight">
            <span className="text-body font-semibold text-white">재현테크</span>
            <span className="text-micro text-sidebar-text">견적관리 콘솔</span>
          </span>
```

(로고 칩 `bg-accent text-white`(line 70)는 스틸블루 칩 → 그대로 둔다.)

- [ ] **Step 3: 프로필 블록 다크화**

`layout.tsx:98-110` 교체:

```tsx
        {/* 프로필 */}
        <div className="mx-3 mb-4 mt-2 flex items-center gap-3 rounded-lg bg-navy-2 px-3 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-3 text-small font-semibold text-white">
            {isAdmin ? "관" : "영"}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-small font-medium text-white">{isAdmin ? "관리자" : "영업담당"}</span>
            <span className="truncate text-micro text-sidebar-text">재현테크</span>
          </span>
          <form action={signOut}>
            <button className="text-sidebar-text transition-colors hover:text-white" aria-label="로그아웃" title="로그아웃">
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
```

- [ ] **Step 4: typecheck + lint + build**

Run: `pnpm --filter @jhtechsaas/web typecheck && pnpm --filter @jhtechsaas/web lint && pnpm --filter @jhtechsaas/web build`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx
git commit -m "feat: 콘솔 사이드바 다크 반전(딥네이비 위 라이트 글자)"
```

---

## Task 3: nav 링크 + active 표시 (SidebarNav 클라 컴포넌트)

현재 nav는 hover만 있고 active(현재 페이지) 표시가 없다. 목업처럼 활성 항목을 스틸블루로 강조하려면 `usePathname`이 필요한데 `layout.tsx`는 서버 컴포넌트라 nav 링크 목록을 작은 클라 컴포넌트로 분리한다.

**Files:**
- Create: `apps/web/src/app/admin/_components/SidebarNav.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx:79-95` (nav 블록 → `<SidebarNav items={...} />`)

- [ ] **Step 1: SidebarNav 클라 컴포넌트 작성**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

// 사이드바 nav — active(현재 경로) 항목을 스틸블루로 강조. 서버 layout에서 items를 받는다.
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {items.map((it) => {
        // 정확 일치 또는 하위 경로(예: /admin/applications/[id])도 active
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body font-medium transition-colors ${
              active ? "bg-navy-2 text-white" : "text-sidebar-text hover:bg-navy-2 hover:text-white"
            }`}
          >
            <Icon
              name={it.icon}
              size={18}
              className={`shrink-0 transition-colors ${active ? "text-white" : "text-sidebar-text group-hover:text-white"}`}
            />
            <span className="flex-1">{it.label}</span>
            {it.badge != null && it.badge > 0 && (
              <span className="rounded-full bg-sidebar-text px-2 py-0.5 text-micro font-semibold text-navy">
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: layout.tsx에서 nav 블록 교체**

`layout.tsx:79-95`의 `<nav>...</nav>` 전체를 다음으로 교체하고, 상단 import에 `import { SidebarNav } from "./_components/SidebarNav";` 추가:

```tsx
        <SidebarNav items={items.filter((it) => it.show)} />
```

(`items` 배열 타입이 `SidebarNav`의 `NavItem`과 호환되는지 확인 — 기존 `items`는 `show` 포함이므로 `.filter` 후 넘기면 됨. `show` 여분 속성은 구조적 호환이라 OK.)

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter @jhtechsaas/web typecheck && pnpm --filter @jhtechsaas/web build`
Expected: 통과. (`as any` 0 유지 — 캐스팅 쓰지 말 것.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/_components/SidebarNav.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat: 사이드바 active nav 강조(SidebarNav 클라 컴포넌트)"
```

---

## Task 4: 하드코딩 색 시각 점검·정리

토큰 기반 유틸은 자동 반영되지만, Tailwind 팔레트 색을 직접 쓴 곳(예: 의뢰상세 "미등록 고객" `bg-amber-100`)은 새 톤과 어긋날 수 있다. 찾아서 거슬리는 것만 최소 수정.

**Files:**
- 점검 대상: `apps/web/src/app/admin/**`

- [ ] **Step 1: 하드코딩 팔레트 색 목록화**

Run:
```bash
grep -rnoE "(bg|text|border)-(slate|gray|zinc|indigo|violet|purple|amber|sky|blue|cyan)-[0-9]{3}" apps/web/src/app/admin | sort | uniq -c | sort -rn
```
Expected: 하드코딩 색 사용처 목록. 상태 색(amber/blue/violet/green/red 계열의 **상태 배지**)은 스파인이므로 **건드리지 않는다**. 그 외 중립 회색(slate/gray/zinc)이 새 그레이와 충돌하면 토큰(`text-muted`/`border-border`/`bg-surface-2`)으로 교체 후보.

- [ ] **Step 2: 로컬 dev로 페이지 육안 점검 후 거슬리는 것만 수정**

(Step "Task 6"의 시각 점검과 함께 수행) 명백히 톤이 튀는 중립색만 토큰으로 교체. 상태 스파인·의미색은 유지. 변경이 없으면 이 태스크는 커밋 없이 넘어간다.

- [ ] **Step 3: (변경 시) Commit**

```bash
git add -A apps/web/src/app/admin
git commit -m "fix: 새 팔레트와 충돌하는 하드코딩 중립색 토큰화"
```

---

## Task 5: DESIGN.md 갱신 (단일 출처)

**Files:**
- Modify: `DESIGN.md` (Color 섹션, Layout 섹션, Decisions Log)

- [ ] **Step 1: Color 섹션 교체**

`DESIGN.md`의 `## Color` 섹션에서 v3 인디고 값 설명을 새 팔레트로 갱신:
- 브랜드 액센트: `#1F3B5C`(스틸블루) — 버튼·active·아이콘칩·배지. 보조 accent-2 `#2E4E73`·accent-soft `#E2E8F1`·accent-ring `#C3CEDC`.
- 네이비 베이스: navy `#0B1F3A` · navy-2 `#1F3B5C` · navy-3 `#2E4E73` — 사이드바·배너.
- 중립: bg `#E6E9EF` · sidebar `#0B1F3A`(다크) · sidebar-text `#A7B1BE` · surface `#fff` · surface-2 `#EEF1F6` · border `#D6DBE4` · text `#2B2F36`(차콜) · muted `#667285`.
- 상태 스파인·도넛 파스텔·장비 active/inactive = **변경 없음** 명시.

- [ ] **Step 2: Layout 섹션 사이드바 설명 갱신**

`## Layout`의 콘솔(v3) 줄에서 "라이트 사이드바(224px, bg #e7e9f3)"를 "**다크 사이드바(224px, bg #0B1F3A, 라이트 글자)**, active=navy-2 강조"로 갱신.

- [ ] **Step 3: Decisions Log 한 줄 추가**

```markdown
| 2026-06-08 | **콘솔 색 재단장** — v3 소프트 인디고 → 딥네이비+스틸블루 모노톤(팔레트 #0B1F3A·#1F3B5C·#A7B1BE·#E6E9EF·#2B2F36), 사이드바 라이트→다크 반전, accent 모노톤(스틸블루). 상태 스파인 불변. | Seonje님 승인(새 팔레트 이미지). 토큰 값 교체+사이드바 반전. globals.css `--color-accent` 등 한 곳에서 관리. |
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs: DESIGN.md 색 재단장 반영(딥네이비+스틸블루) + Decisions Log"
```

---

## Task 6: 전체 게이트 + 콘솔 시각 회귀 검증

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 게이트**

Run:
```bash
pnpm --filter @jhtechsaas/shared test --run
pnpm --filter @jhtechsaas/web test --run
pnpm --filter @jhtechsaas/web typecheck
pnpm --filter @jhtechsaas/web lint
pnpm --filter @jhtechsaas/web build
```
Expected: 전부 통과. (db-tests:rls는 색과 무관하나 게이트 완전성 위해 로컬 supabase 있으면 실행: `supabase db reset` → `bash supabase/seed/seed-local.sh` → `pnpm --filter @jhtechsaas/db-tests test:rls`.)

- [ ] **Step 2: e2e (로그인 시드 필수)**

Run:
```bash
bash supabase/seed/seed-local.sh   # ⚠️ db reset 했다면 e2e 로그인 시드 복구 필수
pnpm --filter @jhtechsaas/web test:e2e
```
Expected: 통과(색 변경이라 셀렉터 영향 없어야 함).

- [ ] **Step 3: 콘솔 페이지 시각 점검 (browse 스킬)**

로컬 dev 서버 띄우고(`pnpm --filter @jhtechsaas/web dev`) 로그인 후 각 페이지를 browse로 스크린샷 → Read로 확인:
`/admin/dashboard`, `/admin/applications`(목록+상세), `/admin/quotes`(목록+상세+작성), `/admin/customers`, `/admin/equipment`, `/admin/consumables`, `/admin/service-requests`, `/admin/supply-requests`, `/admin/kpi`, `/admin/users`, `/login`.

체크리스트:
- 다크 사이드바: 브랜드·nav 라벨·프로필 글자 가독, active 항목 스틸블루 강조
- 라이트 본문: 글자 대비 OK(차콜 본문·muted 가독)
- 상태 배지: 스파인 색(파랑·보라·앰버·초록·빨강) 유지
- accent(스틸블루) ↔ 신규(밝은블루) 혼동 없음
- 하드코딩 색 튐 없음(있으면 Task 4로 돌아가 수정)

- [ ] **Step 4: 최종 커밋(없으면 생략) 후 완료 보고**

검증 통과 시 `/ship`으로 PR. (DB 변경 없으니 머지 후 `supabase db push` 불필요. Vercel은 머지 시 자동 배포 — NEXT_PUBLIC 변경 없으나 색은 CSS라 재배포로 반영됨.)

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** 토큰 매핑표→Task1, 사이드바 반전→Task2·3, 하드코딩 점검→Task4, DESIGN.md→Task5, 검증(게이트+시각)→Task6. 포털 제외·상태 불변 = Task에서 명시. 누락 없음.
- **플레이스홀더:** 모든 코드 스텝에 실제 값/클래스 포함. "적절히 처리" 류 없음.
- **타입 일관성:** `NavItem` 타입을 Task3에서 정의하고 동일 이름으로 사용. `items.filter(...)` 호환 명시.
