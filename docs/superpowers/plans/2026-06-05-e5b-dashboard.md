# E5b 역할 인식 요약 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 후 첫 화면을 `/admin/dashboard`로 바꿔, 상단 액션 큐(지금 처리할 일) + 하단 전체 현황(상태분포 색바·참조 숫자)을 한눈에 보여준다. RLS가 역할별로 데이터를 자동으로 거른다.

**Architecture:** SSR 단일 async 서버 컴포넌트가 집계 헬퍼들을 `Promise.allSettled`로 호출해 블록별 에러를 흡수한다. 집계는 `lib/{domain}/`의 count 헬퍼(기존 3 재사용 + 신규), 색바·빈상태 판정은 순수 함수로 분리(Vitest 단위 테스트). RLS count 정합성은 db-tests로 단언. 첫 화면 전환은 `landingPathFor` 한 줄 변경(별도 커밋).

**Tech Stack:** Next.js(App Router, 이 repo는 비표준 — `apps/web/AGENTS.md` 참조: 코드 전 `node_modules/next/dist/docs/` 확인), Supabase server client, Vitest(web 단위), pg 기반 db-tests(RLS), Playwright(e2e). 이슈 #46.

**Issue:** Closes #46. 설계 doc·테스트플랜·autoplan 리뷰: `~/.gstack/projects/jhtechSaaS/`.

---

## File Structure

신규/수정 파일과 책임:

- `apps/web/src/lib/dashboard/aggregates.ts` (신규) — 도메인별 상태 count + 참조 count 집계 헬퍼(server-only). 일반 server client만 사용.
- `apps/web/src/lib/dashboard/bars.ts` (신규) — **순수 함수**: count record → 색바 세그먼트, 빈상태 판정. server-only 아님(단위 테스트 대상).
- `apps/web/src/lib/dashboard/bars.test.ts` (신규) — bars.ts 단위 테스트.
- `apps/web/src/app/admin/dashboard/page.tsx` (신규) — SSR 페이지(가드 + allSettled + 조립).
- `apps/web/src/app/admin/dashboard/_components/ActionQueue.tsx` (신규) — 상단 3카드.
- `apps/web/src/app/admin/dashboard/_components/StatusBar.tsx` (신규) — 색바 + mono 숫자 행(순수 표시).
- `apps/web/src/app/admin/dashboard/_components/ReferenceCounts.tsx` (신규) — 고객·장비 참조 숫자.
- `apps/web/src/app/admin/dashboard/_components/EmptyOnboarding.tsx` (신규) — 빈상태 온보딩 카드.
- `apps/web/src/app/admin/dashboard/_components/AssigneeLoad.tsx` (신규, **마지막·분리 가능**) — 담당자별 부하.
- `apps/web/src/lib/auth/console.ts` (수정) — `landingPathFor` dashboard 반환.
- `apps/web/src/lib/auth/console.test.ts` (수정) — 4단언 갱신.
- `apps/web/src/app/admin/layout.tsx` (수정) — 사이드바 "대시보드" 최상단.
- `packages/db-tests/src/dashboard_counts.test.ts` (신규) — RLS count 정합성.
- `apps/web/e2e/dashboard.spec.ts` (신규) — 빈상태·가드·랜딩 회귀.

**색·라벨 출처(재사용, 새 색 결정 0):**
- 견적: `APPLICATION_STATUS_META` (`apps/web/src/lib/application-status.tsx`) — new 접수 #2563EB / assigned 배정 #7C3AED / quoted 견적중 #D97706 / closed 완료 #16A34A
- A/S·소모품: `STATUS_META` (`apps/web/src/lib/request-status.tsx`) — received 접수 #2563EB / in_progress 진행중 #D97706 / on_hold 보류 #64748B / done 완료 #16A34A / canceled 취소 #DC2626

**DESIGN.md 토큰(기존 코드에서 확인):** `text-h1/h2/body/small/micro`, `text-text/muted/accent`, `bg-surface/surface-2`, `border-border`, `rounded-md`. 빈 트랙색 `bg-surface-2`(#F1F5F9), 테두리 `border-border`(#E2E8F0).

**v1 스코프 메모(autoplan 결정 참조):** Suspense 스트리밍은 v1에서 **미적용**(데이터 ~0이라 지연 이득 없음 + 이 repo Next 비표준이라 보수적). 블록별 에러 흡수는 `Promise.allSettled`로 달성. Suspense는 데이터 증가 시 후속 최적화로 문서화. 담당자별 부하(Task 8)는 `users.manage` 게이트 + RLS상 보이는 범위만 집계(프로덕션 admin은 service/supply view_all 없어 부분집계 — 주석 명시), **분리 가능**.

---

### Task 0: 브랜치 생성

**Files:** 없음(git).

- [ ] **Step 1: 최신 main에서 feature 브랜치 생성**

Run:
```bash
cd /Users/seonjecho/Projects/jhtechSaaS
git checkout main && git pull --ff-only
git checkout -b feat/e5b-dashboard
```
Expected: `Switched to a new branch 'feat/e5b-dashboard'`

CLAUDE.md hard rule: main 직접 푸시 금지. 모든 커밋은 이 브랜치로.

---

### Task 1: 색바·빈상태 순수 함수 (bars.ts)

**Files:**
- Create: `apps/web/src/lib/dashboard/bars.ts`
- Test: `apps/web/src/lib/dashboard/bars.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/dashboard/bars.test.ts
import { describe, expect, test } from "vitest";
import { toBarSegments, isDashboardEmpty } from "./bars";

describe("toBarSegments — count record → 색바 세그먼트", () => {
  const meta = {
    new: { label: "접수", color: "#2563EB" },
    closed: { label: "완료", color: "#16A34A" },
  };
  const order = ["new", "closed"] as const;

  test("정상 분포: 세그먼트에 label·color·count·pct", () => {
    const segs = toBarSegments({ new: 3, closed: 1 }, meta, order);
    expect(segs).toEqual([
      { key: "new", label: "접수", color: "#2563EB", count: 3, pct: 75 },
      { key: "closed", label: "완료", color: "#16A34A", count: 1, pct: 25 },
    ]);
  });

  test("전부 0: pct 0, count 0 (자리 유지용 세그먼트 보존)", () => {
    const segs = toBarSegments({ new: 0, closed: 0 }, meta, order);
    expect(segs.map((s) => s.count)).toEqual([0, 0]);
    expect(segs.map((s) => s.pct)).toEqual([0, 0]);
  });
});

describe("isDashboardEmpty — 전체 0 판정", () => {
  test("모든 도메인 0건이면 true", () => {
    expect(isDashboardEmpty({ applications: 0, service: 0, supply: 0 })).toBe(true);
  });
  test("한 도메인이라도 있으면 false", () => {
    expect(isDashboardEmpty({ applications: 2, service: 0, supply: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test bars`
Expected: FAIL — `toBarSegments`/`isDashboardEmpty` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/lib/dashboard/bars.ts
// 대시보드 색바·빈상태 순수 함수 — server-only 아님(단위 테스트 대상, 컴포넌트가 표시만).

export interface BarSegment {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number; // 0~100, 전체 0이면 0
}

// count record + 상태 메타 + 순서 → 세그먼트 배열. 0건도 세그먼트를 보존(색바가 "0·0·0" 자리 유지).
export function toBarSegments<K extends string>(
  counts: Record<K, number>,
  meta: Record<K, { label: string; color: string }>,
  order: readonly K[],
): BarSegment[] {
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  return order.map((k) => {
    const count = counts[k] ?? 0;
    return {
      key: k,
      label: meta[k].label,
      color: meta[k].color,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });
}

// 전체 도메인 건수 합이 0이면 빈 대시보드(온보딩 노출).
export function isDashboardEmpty(totals: { applications: number; service: number; supply: number }): boolean {
  return totals.applications === 0 && totals.service === 0 && totals.supply === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test bars`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/dashboard/bars.ts apps/web/src/lib/dashboard/bars.test.ts
git commit -m "feat: 대시보드 색바·빈상태 순수 함수 (E5b)"
```

---

### Task 2: 집계 헬퍼 (aggregates.ts)

**Files:**
- Create: `apps/web/src/lib/dashboard/aggregates.ts`

집계 헬퍼는 Supabase 호출 thin wrapper라 단위 테스트 대상이 아니다(RLS 정합성은 Task 7 db-tests). 기존 count 패턴(`admin-queries.ts:67`)을 그대로 따른다.

- [ ] **Step 1: Write implementation**

```typescript
// apps/web/src/lib/dashboard/aggregates.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES } from "@/lib/application-status";
import { SERVICE_REQUEST_STATUSES } from "@/lib/service-requests/status";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";

// 단일 (table,status) 건수. RLS가 가시 범위 제한(영업=본인+미배정 풀, view_all=전체). 에러는 throw —
// 대시보드는 allSettled로 블록 단위 흡수하므로 여기서 0 폴백 금지(0이 "정상 0"인지 "장애"인지 구분 위해).
async function countByStatus(table: string, statuses: readonly string[]): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const entries = await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      if (error) throw new Error(`[dashboard.countByStatus ${table}/${s}] ${error.message}`);
      return [s, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export const countApplicationsByStatus = () =>
  countByStatus("applications", APPLICATION_STATUSES);
export const countServiceByStatus = () =>
  countByStatus("service_requests", SERVICE_REQUEST_STATUSES);
export const countSupplyByStatus = () =>
  countByStatus("supply_requests", SUPPLY_REQUEST_STATUSES);

// 참조 숫자 — 단순 전체 count(RLS 적용). 에러 throw(블록 흡수).
async function countTable(table: string, filter?: { col: string; val: unknown }): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter.col, filter.val);
  const { count, error } = await q;
  if (error) throw new Error(`[dashboard.countTable ${table}] ${error.message}`);
  return count ?? 0;
}

export const countCustomers = () => countTable("companies");
export const countCompanyEquipment = () => countTable("company_equipment");
export const countActiveEquipment = () => countTable("equipment", { col: "status", val: "active" });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS (no type errors). `APPLICATION_STATUSES` 등 import 경로 확인.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/dashboard/aggregates.ts
git commit -m "feat: 대시보드 집계 헬퍼 (도메인별 상태 count + 참조 count) (E5b)"
```

---

### Task 3: StatusBar 컴포넌트 (색바 + mono 숫자)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/_components/StatusBar.tsx`

- [ ] **Step 1: Write implementation**

```tsx
// apps/web/src/app/admin/dashboard/_components/StatusBar.tsx
import type { BarSegment } from "@/lib/dashboard/bars";

// 한 도메인의 상태분포 색바 + mono tabular 숫자 행(DESIGN.md "모든 숫자 mono tabular").
// 0건이어도 세그먼트(0)를 보존해 숫자 행이 자리를 지킨다. 실패 시 error prop로 "집계 실패" 표시.
export function StatusBar({
  title,
  segments,
  error,
}: {
  title: string;
  segments: BarSegment[];
  error?: boolean;
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-small font-medium text-text">{title}</span>
        {error ? (
          <span className="text-micro text-[#DC2626]">집계 실패</span>
        ) : (
          <span className="font-mono text-micro tabular-nums text-muted">{total}건</span>
        )}
      </div>
      {error ? (
        <div className="h-2 rounded-sm bg-surface-2" />
      ) : (
        <>
          <div className="flex h-2 overflow-hidden rounded-sm border border-border bg-surface-2">
            {segments.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.key}
                  style={{ width: `${s.pct}%`, minWidth: 6, backgroundColor: s.color }}
                  aria-label={`${s.label} ${s.count}건`}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 font-mono text-micro tabular-nums text-muted">
            {segments.map((s) => (
              <span key={s.key}>
                <span style={{ color: s.color }}>●</span> {s.label} {s.count}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS. (`font-mono`·`tabular-nums`는 Tailwind 기본 유틸 — DESIGN.md mono tabular 요건 충족.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/dashboard/_components/StatusBar.tsx
git commit -m "feat: 대시보드 StatusBar (색바+mono 숫자) (E5b)"
```

---

### Task 4: ActionQueue · ReferenceCounts · EmptyOnboarding 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/dashboard/_components/ActionQueue.tsx`
- Create: `apps/web/src/app/admin/dashboard/_components/ReferenceCounts.tsx`
- Create: `apps/web/src/app/admin/dashboard/_components/EmptyOnboarding.tsx`

- [ ] **Step 1: ActionQueue**

```tsx
// apps/web/src/app/admin/dashboard/_components/ActionQueue.tsx
import Link from "next/link";

// 상단 "지금 처리할 일" 3카드. 라벨에 미배정/미열람 명시. 클릭 시 해당 목록으로.
// count가 null이면(집계 실패) "—" 표시(0과 구분).
const CARDS = [
  { href: "/admin/applications", label: "견적 미배정", key: "applications" as const },
  { href: "/admin/service-requests", label: "A/S 미열람", key: "service" as const },
  { href: "/admin/supply-requests", label: "소모품 미열람", key: "supply" as const },
];

export function ActionQueue({ counts }: { counts: Record<"applications" | "service" | "supply", number | null> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {CARDS.map((c) => {
        const n = counts[c.key];
        return (
          <Link
            key={c.key}
            href={c.href}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4 hover:bg-surface-2"
          >
            <span className="text-small text-muted">{c.label}</span>
            <span className="font-mono text-h1 tabular-nums font-semibold text-text">
              {n == null ? "—" : n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: ReferenceCounts**

```tsx
// apps/web/src/app/admin/dashboard/_components/ReferenceCounts.tsx
// 하단 참조 숫자 한 줄 — 고객·보유장비·카탈로그 장비. null=집계 실패는 "—".
export function ReferenceCounts({
  customers,
  equipment,
  catalog,
}: {
  customers: number | null;
  equipment: number | null;
  catalog: number | null;
}) {
  const fmt = (n: number | null) => (n == null ? "—" : n);
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 font-mono text-small tabular-nums text-muted">
      <span>고객 {fmt(customers)}</span>
      <span>보유장비 {fmt(equipment)}</span>
      <span>카탈로그 장비 {fmt(catalog)}</span>
    </div>
  );
}
```

- [ ] **Step 3: EmptyOnboarding**

```tsx
// apps/web/src/app/admin/dashboard/_components/EmptyOnboarding.tsx
import Link from "next/link";

// 전체 데이터 0일 때 상단 온보딩 — 다음 행동(고객→장비→영업계정) 안내.
// 데이터 0이 당분간 기본 화면(프로덕션 실데이터 ~0)이므로 1급 상태.
const STEPS = [
  { href: "/admin/customers", label: "고객·보유장비 등록", desc: "고객사와 보유 장비를 먼저 등록하면 A/S·소모품 신청이 실동작합니다." },
  { href: "/admin/equipment", label: "장비 카탈로그 추가", desc: "공개 카탈로그에 노출할 장비를 등록합니다." },
  { href: "/admin/users", label: "영업 계정 추가", desc: "영업 담당자 계정을 만들면 담당자별 현황이 보입니다." },
];

export function EmptyOnboarding({ canManageUsers }: { canManageUsers: boolean }) {
  const steps = canManageUsers ? STEPS : STEPS.filter((s) => s.href !== "/admin/users");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-6">
      <p className="text-h2 font-semibold text-text">시작하기</p>
      <p className="text-small text-muted">아직 신청 데이터가 없습니다. 아래부터 시작하세요.</p>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <Link key={s.href} href={s.href} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-2">
            <span className="font-mono text-small tabular-nums text-accent">{i + 1}</span>
            <span className="flex flex-col">
              <span className="text-body font-medium text-text">{s.label}</span>
              <span className="text-small text-muted">{s.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/dashboard/_components/ActionQueue.tsx apps/web/src/app/admin/dashboard/_components/ReferenceCounts.tsx apps/web/src/app/admin/dashboard/_components/EmptyOnboarding.tsx
git commit -m "feat: 대시보드 액션큐·참조숫자·빈상태 컴포넌트 (E5b)"
```

---

### Task 5: 대시보드 페이지 (SSR + allSettled 조립)

**Files:**
- Create: `apps/web/src/app/admin/dashboard/page.tsx`

⚠️ **시작 전:** `apps/web/AGENTS.md`대로 `node_modules/next/dist/docs/`에서 async 서버 컴포넌트 규약을 확인. 패턴 레퍼런스는 `apps/web/src/app/admin/applications/page.tsx`(가드+forbidden 패널).

- [ ] **Step 1: Write implementation**

```tsx
// apps/web/src/app/admin/dashboard/page.tsx
import { can } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import {
  countApplicationsByStatus,
  countServiceByStatus,
  countSupplyByStatus,
  countCustomers,
  countCompanyEquipment,
  countActiveEquipment,
} from "@/lib/dashboard/aggregates";
import { toBarSegments, isDashboardEmpty } from "@/lib/dashboard/bars";
import { APPLICATION_STATUS_META, APPLICATION_STATUSES } from "@/lib/application-status";
import { STATUS_META } from "@/lib/request-status";
import { SERVICE_REQUEST_STATUSES } from "@/lib/service-requests/status";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";
import { ActionQueue } from "./_components/ActionQueue";
import { StatusBar } from "./_components/StatusBar";
import { ReferenceCounts } from "./_components/ReferenceCounts";
import { EmptyOnboarding } from "./_components/EmptyOnboarding";

// settled 결과 → 값 또는 null(실패). 블록별 에러 흡수(한 집계 실패가 전체를 무너뜨리지 않음).
function val<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

export default async function DashboardPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 필요합니다.</p>
      </div>
    );
  }

  const [
    newApps, unreadSvc, unreadSup,
    appByStatus, svcByStatus, supByStatus,
    customers, equipment, catalog,
  ] = await Promise.allSettled([
    countNewApplications(), countUnreadServiceRequests(), countUnreadSupplyRequests(),
    countApplicationsByStatus(), countServiceByStatus(), countSupplyByStatus(),
    countCustomers(), countCompanyEquipment(), countActiveEquipment(),
  ]);

  const appCounts = val(appByStatus);
  const svcCounts = val(svcByStatus);
  const supCounts = val(supByStatus);

  const totals = {
    applications: appCounts ? Object.values(appCounts).reduce((s, n) => s + n, 0) : 0,
    service: svcCounts ? Object.values(svcCounts).reduce((s, n) => s + n, 0) : 0,
    supply: supCounts ? Object.values(supCounts).reduce((s, n) => s + n, 0) : 0,
  };
  // 모든 도메인 집계가 성공 + 전부 0일 때만 빈상태(집계 실패를 빈상태로 위장 금지).
  const allFetched = appCounts != null && svcCounts != null && supCounts != null;
  const empty = allFetched && isDashboardEmpty(totals);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-semibold text-text">대시보드</h1>

      {empty ? (
        <EmptyOnboarding canManageUsers={can(access.permissions, "users.manage")} />
      ) : (
        <ActionQueue counts={{ applications: val(newApps), service: val(unreadSvc), supply: val(unreadSup) }} />
      )}

      <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
        <p className="text-small font-semibold text-muted">전체 현황</p>
        <StatusBar
          title="견적"
          error={appCounts == null}
          segments={appCounts ? toBarSegments(appCounts, APPLICATION_STATUS_META, APPLICATION_STATUSES) : []}
        />
        <StatusBar
          title="A/S"
          error={svcCounts == null}
          segments={svcCounts ? toBarSegments(svcCounts, STATUS_META, SERVICE_REQUEST_STATUSES) : []}
        />
        <StatusBar
          title="소모품"
          error={supCounts == null}
          segments={supCounts ? toBarSegments(supCounts, STATUS_META, SUPPLY_REQUEST_STATUSES) : []}
        />
        <ReferenceCounts customers={val(customers)} equipment={val(equipment)} catalog={val(catalog)} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS. `STATUS_META` 키가 `SERVICE_REQUEST_STATUSES`/`SUPPLY_REQUEST_STATUSES`(둘 다 동일 5단계 enum)와 일치하는지 확인.

- [ ] **Step 3: 로컬 수동 확인 (선택)**

Run: `pnpm --filter @jhtechsaas/web dev` 후 로그인 → `/admin/dashboard` 진입. 데이터 0이면 온보딩, 데이터 있으면 색바.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat: 대시보드 페이지 SSR 조립 (allSettled 블록 에러 흡수) (E5b)"
```

---

### Task 6: 첫 화면 전환 + 사이드바 메뉴 (별도 커밋)

autoplan T3 결정: 랜딩 변경은 **별도 커밋**으로 분리(회귀 원인분리). LANDING_RULES는 **보존**(T2).

**Files:**
- Modify: `apps/web/src/lib/auth/console.ts:55-60`
- Modify: `apps/web/src/lib/auth/console.test.ts:20-33`
- Modify: `apps/web/src/app/admin/layout.tsx:39`

- [ ] **Step 1: console.test.ts 4단언 갱신(먼저 — 실패 확인)**

```typescript
// apps/web/src/lib/auth/console.test.ts — describe("landingPathFor ...") 블록 교체
describe("landingPathFor — 로그인 후 첫 화면 (E5b: 콘솔 자격자 전원 dashboard)", () => {
  test("영업(SALES_PRESET) → /admin/dashboard", () => {
    expect(landingPathFor([...SALES_PRESET])).toBe("/admin/dashboard");
  });
  test("관리자(super) → /admin/dashboard", () => {
    expect(landingPathFor([...ADMIN_PRESET])).toBe("/admin/dashboard");
  });
  test("고객 권한만 → /admin/dashboard", () => {
    expect(landingPathFor(["customers.edit"])).toBe("/admin/dashboard");
  });
  test("콘솔 무관 키만 → /admin/dashboard (안전 기본)", () => {
    expect(landingPathFor(["nonsense.key"])).toBe("/admin/dashboard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test console`
Expected: FAIL — landingPathFor가 아직 `/admin/applications` 반환.

- [ ] **Step 3: console.ts 변경 (LANDING_RULES 보존, 반환만 변경)**

`apps/web/src/lib/auth/console.ts`의 `landingPathFor` 함수를 교체. `LANDING_RULES` 상수는 **삭제하지 말고 보존**(사이드바/카드 우선순위 힌트 용도, 주석 갱신):

```typescript
// 로그인 후 첫 화면 — E5b: 콘솔 자격자는 전원 대시보드. (LANDING_RULES는 보존: 향후 카드/메뉴 우선순위 힌트)
export function landingPathFor(_permissions: readonly string[]): string {
  return "/admin/dashboard";
}
```

`LANDING_RULES` 상수 선언 위 주석에 `// (E5b: landingPathFor는 더는 사용 안 함 — 우선순위 힌트로 보존)` 추가. `_permissions` 언더스코어로 미사용 인자 표시(lint).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test console`
Expected: PASS (landingPathFor 4 + hasAnyConsoleCapability 4).

- [ ] **Step 5: 사이드바 "대시보드" 메뉴 최상단 추가**

`apps/web/src/app/admin/layout.tsx`의 `items` 배열 맨 앞에 추가(line 39 직후, "견적" 항목 위):

```tsx
    { href: "/admin/dashboard", label: "대시보드", show: true },
```

(콘솔 자격자는 전원 진입 가능하므로 `show: true`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/console.ts apps/web/src/lib/auth/console.test.ts apps/web/src/app/admin/layout.tsx
git commit -m "feat: 로그인 후 첫 화면을 대시보드로 전환 + 사이드바 메뉴 (E5b)"
```

---

### Task 7: db-tests — RLS count 정합성

**Files:**
- Create: `packages/db-tests/src/dashboard_counts.test.ts`

⚠️ db-tests 전 `supabase db reset`(전역 count 단언이 seed-local 잔여행에 취약 — CLAUDE.md).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db-tests/src/dashboard_counts.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 대시보드 색바/액션큐 count가 RLS를 그대로 존중하는지 — 역할별 가시범위 단언.
describe("dashboard counts — applications status RLS 정합", () => {
  const POOL = "00000000-0000-0000-0000-0000000000d1"; // 미배정 new
  const MINE = "00000000-0000-0000-0000-0000000000d2"; // sales1 배정

  async function seed(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "d-sales1@jhtech.test");
    await seedAuthUser(c, UID.admin, "d-admin@jhtech.test");
    // sales1 = claim만, admin = applications.view_all
    await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,status) values ($1,'풀','new')", [POOL]);
    await c.query("insert into public.applications (id,company,status,assignee_id) values ($1,'내것','assigned',$2)", [MINE, UID.sales1]);
  }

  test("claim 영업: status='new' count = 공용 미배정 풀(본인것 아님)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await c.query("select count(*)::int n from public.applications where status='new'");
      expect(r.rows[0].n).toBe(1); // 미배정 풀의 new 1건이 보인다(claim 가시)
    });
  });

  test("view_all 계정: 전체 status count 합 = 2", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select count(*)::int n from public.applications");
      expect(r.rows[0].n).toBe(2);
    });
  });

  test("권한 없는 계정: applications count = 0(RLS 차단)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await seedAuthUser(c, UID.sales2, "d-sales2@jhtech.test");
      await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      const r = await c.query("select count(*)::int n from public.applications");
      expect(r.rows[0].n).toBe(0);
    });
  });
});

// 담당자별 부하 이름 매핑 — profiles RLS는 users.manage만 타인 이름 허용(plan 핵심 제약).
describe("dashboard assigneeLoad — profiles 이름 RLS", () => {
  async function seedTwo(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.admin, "d2-admin@jhtech.test");
    await seedAuthUser(c, UID.sales1, "d2-sales1@jhtech.test");
    await c.query("update public.profiles set name='관리자' where id=$1", [UID.admin]);
    await c.query("update public.profiles set name='영업1' where id=$1", [UID.sales1]);
  }

  test("users.manage 계정: 타인 profiles.name 읽힘", async () => {
    await inRollbackTx(c, async () => {
      await seedTwo();
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.profiles where id=$1", [UID.sales1]);
      expect(r.rows[0]?.name).toBe("영업1");
    });
  });

  test("users.manage 없는 계정: 타인 profiles 행 안 보임(이름 null 방향)", async () => {
    await inRollbackTx(c, async () => {
      await seedTwo();
      await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.profiles where id=$1", [UID.sales1]);
      expect(r.rowCount).toBe(0); // 타인 행 자체가 안 보임 → 이름 매핑 null(fail-safe)
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes (RLS 정책은 이미 존재 → 단언만 추가)**

Run:
```bash
cd /Users/seonjecho/Projects/jhtechSaaS
supabase db reset
pnpm --filter @jhtechsaas/db-tests test:rls dashboard_counts
```
Expected: PASS (5 tests). 실패 시 RLS 정책(20260604130000_e5a_claim_scope.sql / 20260529150002_permissions.sql)과 대조.

- [ ] **Step 3: Commit**

```bash
git add packages/db-tests/src/dashboard_counts.test.ts
git commit -m "test: 대시보드 count RLS 정합성 단언 (E5b)"
```

---

### Task 8: 담당자별 부하 (users.manage 게이트, 분리 가능)

⚠️ **분리 가능:** 현재 영업 0명·admin 1명이라 즉시 가치 낮음(CEO 리뷰). 코어 대시보드(Task 1~7) 머지 후 별도로 진행해도 됨. RLS 제약: 프로덕션 admin은 applications.view_all만 있고 service/supply.view_all 없어 → A/S·소모품 부하는 RLS상 부분집계(주석 명시).

**Files:**
- Create: `apps/web/src/app/admin/dashboard/_components/AssigneeLoad.tsx`
- Modify: `apps/web/src/lib/dashboard/aggregates.ts` (assigneeLoad 추가)
- Modify: `apps/web/src/app/admin/dashboard/page.tsx` (users.manage 시 렌더)

- [ ] **Step 1: assigneeLoad 헬퍼 추가 (aggregates.ts 말미)**

```typescript
// 담당자별 미완료 부하 — users.manage 전용(이름 RLS). listAssignableStaff(한 자릿수) × 도메인 미완료 count.
// ⚠️ RLS상 viewer가 view_all 없는 도메인은 본인 배정분만 집계됨(프로덕션 admin은 견적만 view_all) → 부분집계.
// 무제한 row pull 금지 → 담당자 목록(소수) 기준으로 도메인별 count head 쿼리.
export async function assigneeLoad(): Promise<{ id: string; name: string; applications: number; service: number; supply: number }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: staff } = await supabase.from("profiles").select("id,name").eq("is_active", true).order("name");
  const rows = staff ?? [];
  const APP_OPEN = ["new", "assigned", "quoted"]; // 미완료(closed 제외)
  const REQ_OPEN = ["received", "in_progress", "on_hold"]; // 미완료(done/canceled 제외)
  return Promise.all(
    rows.map(async (s) => {
      const [a, sv, su] = await Promise.all([
        supabase.from("applications").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", APP_OPEN),
        supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", REQ_OPEN),
        supabase.from("supply_requests").select("id", { count: "exact", head: true }).eq("assignee_id", s.id).in("status", REQ_OPEN),
      ]);
      return { id: s.id as string, name: (s.name as string) ?? "?", applications: a.count ?? 0, service: sv.count ?? 0, supply: su.count ?? 0 };
    }),
  );
}
```

- [ ] **Step 2: AssigneeLoad 컴포넌트**

```tsx
// apps/web/src/app/admin/dashboard/_components/AssigneeLoad.tsx
type Load = { id: string; name: string; applications: number; service: number; supply: number };

export function AssigneeLoad({ rows }: { rows: Load[] }) {
  const active = rows.filter((r) => r.applications + r.service + r.supply > 0);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-small font-semibold text-muted">담당자별 부하 (미완료)</p>
      {active.length === 0 ? (
        <p className="text-small text-muted">진행 중인 배정 건이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-small tabular-nums text-text">
          {active.map((r) => (
            <span key={r.id}>{r.name} 견적{r.applications}·A/S{r.service}·소모품{r.supply}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: page.tsx에서 users.manage일 때만 렌더**

page.tsx의 import에 `assigneeLoad`(aggregates)와 `AssigneeLoad`(컴포넌트) 추가. `Promise.allSettled` 배열에 조건부로 넣지 말고, `can(access.permissions, "users.manage")`일 때만 별도 `await assigneeLoad().catch(() => null)` 호출 후, `<section>` 안 `<ReferenceCounts/>` 아래에 렌더:

```tsx
{can(access.permissions, "users.manage") && loadRows && <AssigneeLoad rows={loadRows} />}
```

(page 상단에서 `const loadRows = can(access.permissions, "users.manage") ? await assigneeLoad().catch(() => null) : null;`)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/dashboard/_components/AssigneeLoad.tsx apps/web/src/lib/dashboard/aggregates.ts apps/web/src/app/admin/dashboard/page.tsx
git commit -m "feat: 대시보드 담당자별 부하 (users.manage 게이트) (E5b)"
```

---

### Task 9: e2e — 빈상태·가드·랜딩 회귀

**Files:**
- Create: `apps/web/e2e/dashboard.spec.ts`

⚠️ 기존 e2e 로그인 헬퍼·config 패턴 확인(`apps/web/e2e/` 내 기존 spec 참조). 프로덕션/로컬 데이터 상태에 따라 빈상태 단언이 갈리므로, 로컬 seed 기준으로 작성하거나 data-testid로 분기.

- [ ] **Step 1: Write e2e**

```typescript
// apps/web/e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";
// (기존 spec의 로그인 헬퍼 import 경로를 그대로 사용 — 예: import { loginAsAdmin } from "./_helpers")

test("로그인 후 첫 화면이 /admin/dashboard", async ({ page }) => {
  // 기존 헬퍼로 admin 로그인 (헬퍼는 waitForURL(/\/admin\//) 느슨 패턴이라 dashboard로 바뀌어도 통과)
  // await loginAsAdmin(page);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
});

test("데이터 0: 온보딩 안내가 보인다", async ({ page }) => {
  // await loginAsAdmin(page);
  await page.goto("/admin/dashboard");
  // 데이터 0 환경에서만 — seed 없는 로컬/CI 기준. 데이터 있으면 액션큐가 대신 보임.
  const onboarding = page.getByText("시작하기");
  const actionQueue = page.getByText("견적 미배정");
  await expect(onboarding.or(actionQueue)).toBeVisible();
});
```

⚠️ data-testid 추가가 필요하면 컴포넌트에 `data-testid="dashboard-empty"` / `"dashboard-action-queue"`를 달아 단언을 결정적으로. (Task 4 컴포넌트에 testid 추가 후 여기서 사용.)

- [ ] **Step 2: Run e2e**

Run: `pnpm --filter @jhtechsaas/web test:e2e dashboard`
Expected: PASS (2 tests). 로그인 헬퍼 경로·data-testid 맞춤.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/dashboard.spec.ts apps/web/src/app/admin/dashboard/_components/
git commit -m "test: 대시보드 e2e (첫화면·빈상태) (E5b)"
```

---

### Task 10: 전체 게이트 통과

CLAUDE.md 머지 전 게이트 — 전부 GREEN이어야 PR.

- [ ] **Step 1: 전체 게이트 실행**

Run:
```bash
cd /Users/seonjecho/Projects/jhtechSaaS
pnpm --filter @jhtechsaas/shared test
pnpm --filter @jhtechsaas/web test
supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter @jhtechsaas/web typecheck
pnpm --filter @jhtechsaas/web lint
pnpm --filter @jhtechsaas/web build
pnpm --filter @jhtechsaas/web test:e2e
grep -rn "as any" apps/web/src/lib/dashboard apps/web/src/app/admin/dashboard || echo "as any 0 ✓"
```
Expected: 전부 PASS, `as any` 0.

- [ ] **Step 2: 실패 시 수정 후 재실행. 전부 GREEN이면 /review → /ship 으로.**

---

## Self-Review

**1. Spec(#46) coverage:**
- AC1 첫화면 dashboard → Task 6 ✓ / AC2 가드 → Task 5 page guard ✓ / AC3 액션큐 라벨·클릭 → Task 4 ActionQueue ✓ / AC4 색바+mono숫자·0처리 → Task 1·3 ✓ / AC5 영업 new=풀 → Task 7 db-test ✓ / AC6 users.manage 담당자별부하 → Task 8 ✓ / AC7 allSettled 부분실패 → Task 5 ✓ / AC8 빈상태 온보딩 → Task 4·5 ✓ / AC9 service_role 미사용 → aggregates는 createSupabaseServerClient만 ✓ / AC10 테스트 → Task 1·7·9 ✓.
- Out of scope(견적 closed enum, Approach B, 차트, 실시간) — 미포함 ✓.

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드. e2e 로그인 헬퍼만 "기존 패턴 확인" — 실제 헬퍼 경로는 repo의 기존 spec에 의존하므로 구현자가 1줄 맞춤(불가피, 명시함).

**3. Type consistency:** `BarSegment`(bars.ts) → StatusBar/page 일관. `toBarSegments(counts, meta, order)` 시그니처 Task 1·5 일치. `countApplicationsByStatus` 등 이름 Task 2·5 일치. `STATUS_META`는 service·supply 공용(둘 다 RequestStatus 5단계) — page.tsx에서 동일 meta 재사용 일관.

**주의(구현자):** 이 repo Next.js는 비표준(`apps/web/AGENTS.md`). async 서버 컴포넌트·params는 `node_modules/next/dist/docs/` 확인 후 작성. 레퍼런스 = 기존 `admin/applications/page.tsx`.
