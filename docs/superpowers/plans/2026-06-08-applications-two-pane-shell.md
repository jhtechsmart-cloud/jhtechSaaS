# 의뢰관리 2분할 셸 + 확장형 목록 구현 계획 (2단계 슬라이스 1/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 의뢰 목록+상세를 레이아웃 기반 2분할로 합치고, 목록을 "진행중 기본 + 검색 + 더보기(서버 페이지네이션) + 날짜그룹"으로 확장형으로 만든다.

**Architecture:** Next.js App Router 세그먼트 레이아웃 — `applications/layout.tsx`가 왼쪽 목록 패널(고정)과 오른쪽 `{children}`(상세)을 렌더. 목록은 클라 컴포넌트(검색·탭·더보기·날짜그룹·선택강조)가 서버 액션으로 페이지를 가져온다. 색은 1단계 토큰 그대로.

**Tech Stack:** Next.js 16 App Router(서버/클라 컴포넌트, 서버 액션), Supabase(PostgREST), Tailwind v4 토큰, Vitest(순수 로직), Playwright(e2e).

> ⚠️ 쿼리 함수(Supabase 의존)는 단위테스트 대상이 아님 → 순수 로직만 TDD, 쿼리/컴포넌트는 typecheck+build+e2e+육안으로 검증. 가짜 테스트 금지.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `apps/web/src/lib/applications/admin-search.ts` | 검색 OR 빌더 + 날짜그룹 분류(순수) | 변경(buildSearchOr 확장 + dateGroupOf 추가) |
| `apps/web/src/lib/applications/admin-search.test.ts` | 순수 로직 단위테스트 | 변경(케이스 추가) |
| `apps/web/src/lib/applications/admin-queries.ts` | `listApplicationsPage` + `countApplicationsByGroup` | 변경(추가) |
| `apps/web/src/lib/applications/admin-actions.ts` | 서버 액션 `fetchApplicationsPage` | 변경(추가) |
| `apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx` | 왼쪽 목록 패널(클라) | **신규** |
| `apps/web/src/app/admin/applications/layout.tsx` | 2분할 프레임(서버) | **신규** |
| `apps/web/src/app/admin/applications/page.tsx` | 빈 상태(선택 안내) | 변경(축소) |
| `apps/web/src/app/admin/applications/[id]/page.tsx` | 오른쪽 패널 적응(← 목록 제거, 폭) | 변경(소폭) |
| `apps/web/src/app/admin/applications/_components/ApplicationTable.tsx` | 구 전체페이지 테이블 | **삭제**(목록 패널로 대체) |
| `apps/web/e2e/applications*.spec.ts` | 2분할 흐름 e2e | 변경/추가 |

---

## Task 1: 순수 로직 — 검색 biz_no 확장 + 날짜그룹 분류 (TDD)

**Files:**
- Modify: `apps/web/src/lib/applications/admin-search.ts`
- Test: `apps/web/src/lib/applications/admin-search.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`admin-search.test.ts`에 추가(기존 import에 `dateGroupOf` 포함, 기존 `buildSearchOr` import 유지):

```ts
import { describe, it, expect } from "vitest";
import { buildSearchOr, dateGroupOf } from "./admin-search";

describe("buildSearchOr — biz_no 포함", () => {
  it("company·seq_no·biz_no 세 컬럼 ilike OR을 만든다", () => {
    expect(buildSearchOr("대성")).toBe(
      "company.ilike.%대성%,seq_no.ilike.%대성%,biz_no.ilike.%대성%",
    );
  });
  it("메타문자 제거는 유지", () => {
    expect(buildSearchOr("a%b)c")).toBe(
      "company.ilike.%abc%,seq_no.ilike.%abc%,biz_no.ilike.%abc%",
    );
  });
  it("공백만이면 null", () => {
    expect(buildSearchOr("   ")).toBeNull();
  });
});

describe("dateGroupOf — KST 기준 오늘/이번주/이전", () => {
  const now = new Date("2026-06-08T01:00:00Z"); // KST 2026-06-08 10:00
  it("같은 KST 날짜는 today", () => {
    expect(dateGroupOf("2026-06-08T00:30:00Z", now)).toBe("today"); // KST 6/8 09:30
  });
  it("KST 자정 경계: UTC로는 같은 날이어도 KST 다른 날이면 분리", () => {
    // 2026-06-07T15:30:00Z = KST 6/8 00:30 → today
    expect(dateGroupOf("2026-06-07T15:30:00Z", now)).toBe("today");
    // 2026-06-07T14:30:00Z = KST 6/7 23:30 → 1일 전 → week
    expect(dateGroupOf("2026-06-07T14:30:00Z", now)).toBe("week");
  });
  it("6일 전까지 week, 7일 이상은 earlier", () => {
    expect(dateGroupOf("2026-06-02T01:00:00Z", now)).toBe("week"); // 6일 전
    expect(dateGroupOf("2026-06-01T01:00:00Z", now)).toBe("earlier"); // 7일 전
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test --run admin-search`
Expected: FAIL — `dateGroupOf` 미정의, `buildSearchOr`에 biz_no 없음.

- [ ] **Step 3: 구현**

`admin-search.ts`에서 `buildSearchOr` 반환에 biz_no 추가하고, `dateGroupOf`를 추가:

```ts
export function buildSearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (cleaned === "") return null;
  return `company.ilike.%${cleaned}%,seq_no.ilike.%${cleaned}%,biz_no.ilike.%${cleaned}%`;
}

// KST(UTC+9) 기준 날짜 그룹. today=같은 KST 날짜, week=1~6일 전, earlier=7일 이상.
// now를 인자로 받아 테스트 가능(런타임은 new Date()).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
function kstDayIndex(d: Date): number {
  return Math.floor((d.getTime() + KST_OFFSET_MS) / DAY_MS);
}
export type DateGroup = "today" | "week" | "earlier";
export function dateGroupOf(createdAtIso: string, now: Date): DateGroup {
  const diff = kstDayIndex(now) - kstDayIndex(new Date(createdAtIso));
  if (diff <= 0) return "today";
  if (diff < 7) return "week";
  return "earlier";
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web test --run admin-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/applications/admin-search.ts apps/web/src/lib/applications/admin-search.test.ts
git commit -m "feat: 의뢰 검색 biz_no 확장 + 날짜그룹 분류 순수함수(dateGroupOf)"
```

---

## Task 2: 백엔드 — 페이지네이션 쿼리 + 그룹 카운트

**Files:**
- Modify: `apps/web/src/lib/applications/admin-queries.ts`

쿼리 함수는 Supabase 의존이라 단위테스트 대신 typecheck+build로 검증한다.

- [ ] **Step 1: `listApplicationsPage` + `countApplicationsByGroup` 추가**

`admin-queries.ts`에 추가(기존 `listApplications`/`ApplicationListRow`/`buildSearchOr` 유지). 상단 import에 기존 `buildSearchOr` 그대로 사용:

```ts
// 진행중 스코프 = closed 제외 전부(단일 출처와 일치).
const ACTIVE_STATUSES = ["new", "assigned", "quoted", "quote_sent"] as const;

export type ListScope = "active" | "closed" | "all";

// 페이지네이션 목록 — created_at desc(동률 seq_no desc). q 있으면 스코프 무시 전체검색.
// limit+1 fetch로 hasMore 판정. RLS: 자기배정 OR view_all.
export async function listApplicationsPage(opts: {
  scope: ListScope;
  q?: string;
  offset: number;
  limit: number;
}): Promise<{ rows: ApplicationListRow[]; hasMore: boolean }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("applications")
    .select("id,seq_no,status,company,assignee_id,created_at,fields,profiles:assignee_id(name)")
    .order("created_at", { ascending: false })
    .order("seq_no", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit); // +1 행으로 hasMore 감지

  const orFilter = opts.q ? buildSearchOr(opts.q) : null;
  if (orFilter) {
    query = query.or(orFilter); // 검색 시 스코프 무시(전체 상태)
  } else if (opts.scope === "active") {
    query = query.in("status", ACTIVE_STATUSES as unknown as string[]);
  } else if (opts.scope === "closed") {
    query = query.eq("status", "closed");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[applications.listPage]", error);
    return { rows: [], hasMore: false };
  }
  const all = (data ?? []) as Record<string, unknown>[];
  const hasMore = all.length > opts.limit;
  const sliced = hasMore ? all.slice(0, opts.limit) : all;
  const rows: ApplicationListRow[] = sliced.map((r) => {
    const profiles = r.profiles as { name?: string } | null;
    const fields = (r.fields as { equipment_name?: string; requirements?: string } | null) ?? {};
    const summary = fields.equipment_name ?? (fields.requirements ?? "").slice(0, 40);
    return {
      id: r.id as string,
      seq_no: r.seq_no as string,
      status: r.status as ApplicationStatus,
      company: r.company as string,
      summary,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      is_new: r.status === "new",
      created_at: r.created_at as string,
    };
  });
  return { rows, hasMore };
}

// 탭 카운트 — 진행중/완료. RLS 스코프 그대로 적용(영업담당은 자기 가시범위 셈).
export async function countApplicationsByGroup(): Promise<{ active: number; closed: number }> {
  const supabase = await createSupabaseServerClient();
  const [activeRes, closedRes] = await Promise.all([
    supabase.from("applications").select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES as unknown as string[]),
    supabase.from("applications").select("id", { count: "exact", head: true })
      .eq("status", "closed"),
  ]);
  if (activeRes.error) console.error("[applications.countActive]", activeRes.error);
  if (closedRes.error) console.error("[applications.countClosed]", closedRes.error);
  return { active: activeRes.count ?? 0, closed: closedRes.count ?? 0 };
}
```

> `as unknown as string[]`는 readonly 튜플→`.in()` 인자 변환용(값 캐스팅 아님, `as any` 아님). 불가피하면 이 한 줄만 허용.

- [ ] **Step 2: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/applications/admin-queries.ts
git commit -m "feat: 의뢰 목록 페이지네이션 쿼리 + 진행중/완료 카운트"
```

---

## Task 3: 서버 액션 — fetchApplicationsPage

**Files:**
- Modify: `apps/web/src/lib/applications/admin-actions.ts`

- [ ] **Step 1: 액션 추가**

`admin-actions.ts` 하단에 추가(상단 import에 `listApplicationsPage`, `ListScope`, `ApplicationListRow`, `requireApplicationsConsole` 필요 — 기존 `requirePermission`과 별개로 `@/lib/auth/guard`에서 `requireApplicationsConsole` import):

```ts
import {
  listApplicationsPage, type ListScope, type ApplicationListRow,
} from "./admin-queries";
import { requireApplicationsConsole } from "@/lib/auth/guard";

// 클라 목록 패널이 더보기·탭·검색 시 호출. 권한 가드 후 페이지 반환.
export async function fetchApplicationsPage(opts: {
  scope: ListScope;
  q?: string;
  offset: number;
  limit: number;
}): Promise<{ rows: ApplicationListRow[]; hasMore: boolean }> {
  const access = await requireApplicationsConsole();
  if (access.status === "forbidden") return { rows: [], hasMore: false };
  return listApplicationsPage(opts);
}
```

- [ ] **Step 2: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/applications/admin-actions.ts
git commit -m "feat: 의뢰 목록 페이지 서버 액션 fetchApplicationsPage"
```

---

## Task 4: ApplicationListPane 클라 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplicationStatusBadge } from "@/lib/application-status";
import { dateGroupOf, type DateGroup } from "@/lib/applications/admin-search";
import { fetchApplicationsPage } from "@/lib/applications/admin-actions";
import type { ApplicationListRow, ListScope } from "@/lib/applications/admin-queries";

const PAGE = 30;
const TABS: { key: ListScope; label: string }[] = [
  { key: "active", label: "진행중" },
  { key: "closed", label: "완료" },
  { key: "all", label: "전체" },
];
const GROUP_LABEL: Record<DateGroup, string> = { today: "오늘", week: "이번 주", earlier: "이전" };
const GROUP_ORDER: DateGroup[] = ["today", "week", "earlier"];

export function ApplicationListPane({
  initialRows, initialHasMore, counts, canQuote,
}: {
  initialRows: ApplicationListRow[];
  initialHasMore: boolean;
  counts: { active: number; closed: number };
  canQuote: boolean;
}) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/admin/applications/")
    ? pathname.split("/")[3] ?? null
    : null;

  const [scope, setScope] = useState<ListScope>("active");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApplicationListRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // scope/q 변경 → 첫 페이지 재조회. 초기(scope=active,q="")는 서버 초기값 사용하므로 스킵.
  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetchApplicationsPage({ scope, q: q.trim() || undefined, offset: 0, limit: PAGE });
      setRows(res.rows);
      setHasMore(res.hasMore);
      setLoading(false);
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [scope, q]);

  async function loadMore() {
    setLoading(true);
    const res = await fetchApplicationsPage({ scope, q: q.trim() || undefined, offset: rows.length, limit: PAGE });
    setRows((prev) => [...prev, ...res.rows]);
    setHasMore(res.hasMore);
    setLoading(false);
  }

  // 날짜 그룹 버킷팅(현재 로드된 rows). 검색 중에도 동일.
  const now = new Date();
  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    rows: rows.filter((r) => dateGroupOf(r.created_at, now) === g),
  })).filter((grp) => grp.rows.length > 0);

  const total = counts.active + counts.closed;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-body font-bold text-text">신청 목록</h2>
          {canQuote && (
            <Link href="/admin/quotes/new" className="rounded-md bg-accent px-2.5 py-1 text-micro font-semibold text-white">
              + 수기 견적
            </Link>
          )}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="업체명·접수번호·사업자번호"
          className="mb-2 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-text"
        />
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScope(t.key)}
              className={`rounded-full px-2.5 py-1 text-micro font-semibold ${scope === t.key ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
            >
              {t.label}
              {t.key === "active" && <span className="ml-1 tabular-nums">{counts.active}</span>}
              {t.key === "closed" && <span className="ml-1 tabular-nums">{counts.closed}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-small text-muted">{loading ? "불러오는 중…" : "해당하는 의뢰가 없습니다"}</p>
        ) : (
          groups.map((grp) => (
            <div key={grp.key}>
              <div className="bg-surface-2 px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-muted">
                {GROUP_LABEL[grp.key]}
              </div>
              {grp.rows.map((it) => {
                const selected = it.id === activeId;
                return (
                  <Link
                    key={it.id}
                    href={`/admin/applications/${it.id}`}
                    className={`block border-b border-surface-2 px-3 py-2.5 ${selected ? "border-l-[3px] border-l-accent bg-accent-soft" : "border-l-[3px] border-l-transparent hover:bg-surface-2"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-small font-semibold text-text">
                        {it.is_new && <span className="inline-block size-1.5 shrink-0 rounded-full bg-accent" aria-label="미처리" />}
                        {it.company}
                      </span>
                      <ApplicationStatusBadge status={it.status} />
                    </div>
                    <div className="mt-0.5 truncate text-micro tabular-nums text-muted">
                      {it.seq_no} · {it.assignee_name ?? "미배정"}{it.summary ? ` · ${it.summary}` : ""}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))
        )}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full bg-surface-2 py-2.5 text-small font-semibold text-accent disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        )}
      </div>

      <div className="border-t border-border px-3 py-2 text-micro text-muted">
        전체 <span className="tabular-nums">{total}</span>건 · {scope === "active" ? `진행중 ${counts.active}건` : scope === "closed" ? `완료 ${counts.closed}건` : "전체"} 표시
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: 통과. (`ApplicationStatusBadge`가 클라 import 가능한지 확인 — 기존 ApplicationTable에서 동일 import 사용했으므로 OK.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx
git commit -m "feat: 의뢰 목록 패널(검색·탭카운트·날짜그룹·더보기·선택강조)"
```

---

## Task 5: layout.tsx(2분할 프레임) + page.tsx(빈 상태)

**Files:**
- Create: `apps/web/src/app/admin/applications/layout.tsx`
- Modify: `apps/web/src/app/admin/applications/page.tsx`

- [ ] **Step 1: layout.tsx 작성**

```tsx
import type { ReactNode } from "react";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { listApplicationsPage, countApplicationsByGroup } from "@/lib/applications/admin-queries";
import { ApplicationListPane } from "./_components/ApplicationListPane";

const PAGE = 30;

// 의뢰관리 2분할 셸 — 왼쪽 목록 패널(고정) + 오른쪽 상세({children}).
// 레이아웃은 자식 네비게이션 시 리렌더되지 않아 목록이 유지된다(마스터-디테일).
export default async function ApplicationsLayout({ children }: { children: ReactNode }) {
  const access = await requireApplicationsConsole();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const [first, counts] = await Promise.all([
    listApplicationsPage({ scope: "active", offset: 0, limit: PAGE }),
    countApplicationsByGroup(),
  ]);
  return (
    <div className="flex h-[calc(100dvh-57px)] gap-0">
      <ApplicationListPane
        initialRows={first.rows}
        initialHasMore={first.hasMore}
        counts={counts}
        canQuote={can(access.permissions, "quotes.write")}
      />
      <div className="min-w-0 flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
```

> `h-[calc(100dvh-57px)]` = 상단바(약 57px) 제외한 높이로 목록/상세가 각자 스크롤. 콘솔 layout의 `<main className="...p-6">`가 이 레이아웃을 감싸므로, 필요 시 콘솔 main의 패딩과 충돌 점검(아래 Step 3).

- [ ] **Step 2: page.tsx를 빈 상태로 축소**

`page.tsx` 전체를 교체:

```tsx
// 의뢰 미선택 상태 — 목록은 layout이 항상 렌더. 여기는 오른쪽 빈 안내만.
export default function ApplicationsIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-h2 font-semibold text-text">의뢰를 선택하세요</p>
      <p className="text-small text-muted">← 왼쪽 목록에서 의뢰 건을 클릭하면 여기에 상세가 표시됩니다.</p>
    </div>
  );
}
```

- [ ] **Step 3: 콘솔 main 패딩 충돌 점검**

`apps/web/src/app/admin/layout.tsx`의 `<main className="mx-auto w-full max-w-[1320px] flex-1 p-6">`가 이 2분할을 감싼다. 2분할은 자체 패딩/높이를 쓰므로, applications 경로에서 이중 패딩이 보이면 이 layout.tsx의 바깥 `<div>`에서 음수마진 대신 — **간단히**: applications/layout.tsx 루트를 `-m-6`로 콘솔 패딩 상쇄(예: `<div className="-m-6 flex h-[calc(100dvh-57px)]">`). 빌드/육안에서 확인 후 조정.

- [ ] **Step 4: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/applications/layout.tsx apps/web/src/app/admin/applications/page.tsx
git commit -m "feat: 의뢰관리 2분할 레이아웃 + 빈 상태 페이지"
```

---

## Task 6: [id]/page.tsx 오른쪽 패널 적응 + 구 테이블 삭제

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/page.tsx`
- Delete: `apps/web/src/app/admin/applications/_components/ApplicationTable.tsx`

- [ ] **Step 1: 상세 컨테이너·← 목록 조정**

`[id]/page.tsx`에서:
- 최상단 `<div className="flex items-center justify-between">` 안의 `<Link href="/admin/applications" ...>← 목록</Link>`를 **제거**(목록 항상 보임). 그 자리에 상태 배지만 남기되, 헤더 줄 구조는 유지(배지를 오른쪽 정렬). 즉 `<div className="flex items-center justify-end">` + `<ApplicationStatusBadge .../>`.
- 루트 컨테이너 `className="flex max-w-2xl flex-col gap-6"` → `className="flex max-w-3xl flex-col gap-6"` (오른쪽 패널 폭 활용; 패널 안에서 스크롤은 layout이 담당).

- [ ] **Step 2: 구 ApplicationTable 삭제**

`ApplicationTable.tsx`는 더 이상 import되지 않는다(page.tsx가 빈 상태로 바뀜). 삭제:

```bash
rm apps/web/src/app/admin/applications/_components/ApplicationTable.tsx
```

- [ ] **Step 3: 잔존 참조 확인**

Run: `grep -rn "ApplicationTable\|listApplications\b" apps/web/src --include=*.tsx --include=*.ts`
Expected: `ApplicationTable` 참조 0(삭제 완료). 구 `listApplications`(페이지네이션 아닌 것)를 더 쓰는 곳 없으면 admin-queries.ts에서 제거 가능(있으면 유지). overflow 의존 코드 없는지 확인.

- [ ] **Step 4: typecheck + lint + build**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: 통과.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/app/admin/applications
git commit -m "feat: 의뢰 상세를 2분할 오른쪽 패널에 적응 + 구 목록 테이블 삭제"
```

---

## Task 7: e2e 갱신 + 전체 게이트 + 시각 검증

**Files:**
- Modify/Create: `apps/web/e2e/applications*.spec.ts` (기존 의뢰 흐름 e2e가 있으면 갱신)

- [ ] **Step 1: 기존 의뢰 e2e 확인·갱신**

Run: `grep -rn "admin/applications" apps/web/e2e`
의뢰 목록→상세 진입 시나리오가 있으면, 2분할에 맞게 갱신:
- 목록 진입 = `/admin/applications`로 가면 왼쪽 패널(`신청 목록`)이 보이고 오른쪽은 "의뢰를 선택하세요".
- 행 클릭(왼쪽 패널의 업체명/링크) → URL `/admin/applications/<uuid>` + 오른쪽에 상세(접수번호) 표시 + 왼쪽 목록 유지.
- 셀렉터는 텍스트 기반(업체명/접수번호) 우선.

- [ ] **Step 2: 2분할 목록 동작 e2e 1개 추가**

`apps/web/e2e/applications-two-pane.spec.ts` 신규(로그인 헬퍼는 기존 e2e 패턴 재사용 — 기존 spec에서 admin 로그인 방식 복사):

```ts
import { test, expect } from "@playwright/test";
// 로그인 헬퍼: 기존 e2e(예: applications.spec.ts/e5a-permissions.spec.ts)의 admin 로그인 절차를 그대로 사용.

test("2분할 — 목록 기본 진행중, 탭 전환, 행 클릭 상세", async ({ page }) => {
  // (기존 패턴으로 admin 로그인)
  await page.goto("/admin/applications");
  await expect(page.getByRole("heading", { name: "신청 목록" })).toBeVisible();
  await expect(page.getByText("의뢰를 선택하세요")).toBeVisible();

  // 진행중 탭이 기본 — 완료 탭으로 전환
  await page.getByRole("button", { name: /완료/ }).click();
  // 전체 탭
  await page.getByRole("button", { name: "전체" }).click();

  // 첫 행 클릭 → 상세 진입(왼쪽 목록 유지)
  const firstCompany = page.locator("aside a[href^='/admin/applications/']").first();
  await firstCompany.click();
  await expect(page).toHaveURL(/\/admin\/applications\/[0-9a-f-]+$/);
  await expect(page.getByText("접수번호")).toBeVisible();
  await expect(page.getByRole("heading", { name: "신청 목록" })).toBeVisible(); // 목록 유지
});
```

> 시드 데이터에 의뢰가 있어야 함(샘플 5상태 존재). 없으면 seed로 보강.

- [ ] **Step 3: 전체 게이트**

Run:
```bash
pnpm --filter @jhtechsaas/shared test --run
pnpm --filter web test --run
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter web test:e2e
grep -rn "as any" apps/web/src/app/admin/applications apps/web/src/lib/applications || echo "as any 0"
```
Expected: 전부 통과. (e2e 전 db reset→seed 필수 — 로그인 시드 복구.)

- [ ] **Step 4: 시각 검증 (browse)**

로컬 dev를 로컬 supabase env로 띄우고(1단계와 동일 방식: `NEXT_PUBLIC_SUPABASE_URL=$API_URL ... pnpm --filter web dev`), 로그인(admin@jhtech.local/jhtech-admin-dev) 후 `/admin/applications` 캡처 → Read로 확인:
- 왼쪽 목록 패널(검색·진행중기본·탭카운트·날짜그룹·더보기·하단요약)
- 행 클릭 시 오른쪽 상세 + 목록 유지 + 선택행 스틸블루 강조
- 빈 상태("의뢰를 선택하세요")
- 새 팔레트 유지, 상태 배지 스파인 색

- [ ] **Step 5: 완료 보고 후 /ship**

게이트·시각 통과 시 보고. DB 변경 없으니 머지 후 db push 불필요.

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** 2분할 레이아웃→Task5, 목록 패널(검색·탭·날짜그룹·더보기·선택)→Task4, 백엔드 페이지네이션·카운트→Task2, 검색 biz_no·날짜그룹 순수→Task1, 서버액션→Task3, 상세 적응·구테이블 삭제→Task6, e2e·게이트·시각→Task7, 빈 상태→Task5. 누락 없음.
- **플레이스홀더:** 모든 코드 스텝에 실제 코드/명령. "적절히" 류 없음. e2e 로그인 헬퍼는 "기존 패턴 복사" 명시(레포의 실제 로그인 절차 재사용).
- **타입 일관성:** `ListScope`·`ApplicationListRow`·`DateGroup`·`dateGroupOf`·`listApplicationsPage`·`fetchApplicationsPage`·`countApplicationsByGroup` 이름이 Task 1~5에서 일관. `ACTIVE_STATUSES` 동일 정의 사용. PAGE=30 일관.
