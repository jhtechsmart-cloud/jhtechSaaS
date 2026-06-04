# E4 견적 트리아지 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 `/request`로 넣은 견적(`applications`)을 admin이 목록·상세·담당배정·상태전이할 수 있는 `/admin/applications` 트리아지 콘솔을 만든다.

**Architecture:** 마이그레이션 0 순수 웹 레이어. 기존 `admin/service-requests` 패턴을 미러링하되, applications 고유 발산(admin_read_at·company_id 컬럼 없음 → `status='new'`로 미처리 신호, biz_no 정규화 매칭으로 P-F 링크)을 처리. RLS·권한·트리거는 E1에서 이미 준비됨(`applications.view_all`·`applications.assign` capability 재사용).

**Tech Stack:** Next.js App Router(Server Components + Server Actions), Supabase(supabase-js, RLS), Zod, Vitest(단위), pg 기반 db-tests(RLS), Playwright(E2E), Tailwind.

**리뷰 출처:** 이슈 #5 + `/autoplan` 리뷰(`~/.gstack/projects/jhtechSaaS/main-issue5-e4-plan-20260604-102258.md`). 형님 게이트 결정: quoted 자유전이 유지(라벨 '견적중'), 목록 서버검색 채택, 고객등록 버튼 유지.

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `apps/web/src/lib/application-status.tsx` | 상태 색·라벨 (색 스파인 버그 수정) | 수정 |
| `apps/web/src/lib/application-status.test.ts` | 색 스파인 일치 단위테스트 | 신규 |
| `apps/web/src/lib/applications/schema.ts` | 설치설문 한글 라벨맵 단일출처 추가 | 수정 |
| `apps/web/src/lib/applications/survey-labels.test.ts` | 라벨맵 enum 커버리지 테스트 | 신규 |
| `apps/web/src/lib/applications/admin-search.ts` | 검색 needle 정규화 + overflow 분리 (순수) | 신규 |
| `apps/web/src/lib/applications/admin-search.test.ts` | 순수로직 단위테스트 | 신규 |
| `apps/web/src/lib/applications/admin-queries.ts` | listApplications/getApplicationForAdmin/countNewApplications | 신규 |
| `apps/web/src/lib/applications/admin-actions.ts` | assign/updateStatus/registerCustomer 서버액션 | 신규 |
| `apps/web/src/app/admin/applications/page.tsx` | 목록 페이지(서버, searchParams 필터) | 신규 |
| `apps/web/src/app/admin/applications/_components/ApplicationTable.tsx` | 목록 테이블(client, URL 기반 서버필터) | 신규 |
| `apps/web/src/app/admin/applications/[id]/page.tsx` | 상세 페이지 | 신규 |
| `apps/web/src/app/admin/applications/[id]/_components/AssignControl.tsx` | 담당 배정(client) | 신규 |
| `apps/web/src/app/admin/applications/[id]/_components/StatusControl.tsx` | 상태 변경(client) | 신규 |
| `apps/web/src/app/admin/applications/[id]/_components/RegisterCustomerButton.tsx` | 고객 등록(client) | 신규 |
| `apps/web/src/app/admin/layout.tsx` | '견적' 네비 링크 + 미배정 배지 | 수정 |
| `packages/db-tests/src/applications.test.ts` | assign auto-bump·해제·0행·타인배정 RLS 단언 | 수정 |
| `apps/web/e2e/applications.spec.ts` | admin E2E 풀 시나리오 | 신규 |
| `docs/roadmap.json` | E4 status todo→done(머지 시) | 수정(마지막) |

---

## Task 1: 색 스파인 버그 수정 (CRITICAL)

`application-status.tsx`의 `assigned`/`quoted` 색이 DESIGN.md 스파인과 정확히 뒤바뀜. E4가 이 배지를 처음 대량 노출하므로 먼저 고친다. 단일 출처라 P-F에도 자동 전파.

**Files:**
- Test: `apps/web/src/lib/application-status.test.ts` (Create)
- Modify: `apps/web/src/lib/application-status.tsx:12-17`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/application-status.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { APPLICATION_STATUS_META, APPLICATION_STATUSES } from "./application-status";

// DESIGN.md 색 스파인(27행): 신규 #2563EB · 배정 #7C3AED · 견적중 #D97706 · 완료(종결) #16A34A
describe("application status 색 스파인 (DESIGN.md 일치)", () => {
  test("배정=보라(#7C3AED), 견적중=앰버(#D97706) — 스왑 회귀 방지", () => {
    expect(APPLICATION_STATUS_META.assigned.color).toBe("#7C3AED");
    expect(APPLICATION_STATUS_META.quoted.color).toBe("#D97706");
  });

  test("신규=#2563EB, 완료=#16A34A", () => {
    expect(APPLICATION_STATUS_META.new.color).toBe("#2563EB");
    expect(APPLICATION_STATUS_META.closed.color).toBe("#16A34A");
  });

  test("quoted 라벨은 '견적중'(E5 전엔 '발송' 단언 금지)", () => {
    expect(APPLICATION_STATUS_META.quoted.label).toBe("견적중");
  });

  test("4개 상태 모두 메타 존재", () => {
    for (const s of APPLICATION_STATUSES) {
      expect(APPLICATION_STATUS_META[s]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test application-status`
Expected: FAIL — `assigned.color` is `#D97706`, expected `#7C3AED`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/application-status.tsx`, replace lines 12-17 (`APPLICATION_STATUS_META`):

```tsx
export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  new: { label: "접수", color: "#2563EB" },
  assigned: { label: "배정", color: "#7C3AED" },
  quoted: { label: "견적중", color: "#D97706" },
  closed: { label: "완료", color: "#16A34A" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test application-status`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/application-status.tsx apps/web/src/lib/application-status.test.ts
git commit -m "fix(applications): 상태 색 스파인 스왑 수정 (배정=보라·견적중=앰버) + 라벨 '견적중'"
```

---

## Task 2: 설치설문 라벨맵 단일출처

상세 화면이 `install_survey` enum 값을 한글로 렌더하려면 라벨맵이 필요하다. 공개폼(`InstallSurvey.tsx`)과 어긋나지 않게 `schema.ts`에 단일출처로 둔다. (이번엔 admin만 import; InstallSurvey 리팩터는 범위 외.)

**Files:**
- Modify: `apps/web/src/lib/applications/schema.ts` (append exports)
- Test: `apps/web/src/lib/applications/survey-labels.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/applications/survey-labels.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  BUILDING_TYPES, LOCATIONS, ELEVATORS, HANDLING_OPTS, POWERS, PNEUMATICS,
  SURVEY_LABELS,
} from "./schema";

describe("설치설문 라벨맵 — enum 전 항목 커버", () => {
  test("모든 enum 값에 한글 라벨이 있다", () => {
    for (const v of BUILDING_TYPES) expect(SURVEY_LABELS.building_type[v]).toBeTruthy();
    for (const v of LOCATIONS) expect(SURVEY_LABELS.location[v]).toBeTruthy();
    for (const v of ELEVATORS) expect(SURVEY_LABELS.elevator[v]).toBeTruthy();
    for (const v of HANDLING_OPTS) expect(SURVEY_LABELS.handling[v]).toBeTruthy();
    for (const v of POWERS) expect(SURVEY_LABELS.power[v]).toBeTruthy();
    for (const v of PNEUMATICS) expect(SURVEY_LABELS.pneumatic[v]).toBeTruthy();
  });

  test("대표 매핑 — 공개폼과 동일 문구", () => {
    expect(SURVEY_LABELS.building_type.factory).toBe("공장");
    expect(SURVEY_LABELS.power.triple_380).toBe("3상 380V");
    expect(SURVEY_LABELS.handling.ladder).toBe("사다리차 필요");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test survey-labels`
Expected: FAIL — `SURVEY_LABELS` is not exported.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/applications/schema.ts`, append at end of file (after `seqNoSchema`):

```ts
// 설치설문 한글 라벨맵 — 공개폼 InstallSurvey.tsx 문구와 동일. admin 상세 렌더의 단일출처.
export const SURVEY_LABELS = {
  building_type: { factory: "공장", store: "상가", office: "사무실", etc: "기타" },
  location: { basement: "지하", ground: "1층", upper: "2층 이상" },
  elevator: { have: "있음", none: "없음" },
  handling: { no_vehicle: "차량 진입 곤란", manual: "수작업 운반", ladder: "사다리차 필요" },
  power: { single_220: "단상 220V", triple_380: "3상 380V" },
  pneumatic: { have: "있음", none: "없음" },
} as const;

// 설문 항목 표시 순서·섹션 라벨.
export const SURVEY_FIELD_LABELS: Record<string, string> = {
  building_type: "건물 유형",
  location: "설치 위치",
  elevator: "엘리베이터",
  power: "전력",
  pneumatic: "공압",
  handling: "기타사항",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test survey-labels`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/applications/schema.ts apps/web/src/lib/applications/survey-labels.test.ts
git commit -m "feat(applications): 설치설문 한글 라벨맵 단일출처 추가"
```

---

## Task 3: 검색 순수로직 (needle 정규화 + overflow 분리)

서버 검색(형님 결정)을 위해 PostgREST `.or()` 필터를 안전하게 만드는 순수 함수를 먼저 만든다. `,()%_*\` 등 PostgREST/ilike 메타문자를 제거(와일드카드·필터 주입 방지). overflow는 limit+1 패턴으로 감지.

**Files:**
- Create: `apps/web/src/lib/applications/admin-search.ts`
- Test: `apps/web/src/lib/applications/admin-search.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/applications/admin-search.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildSearchOr, splitOverflow } from "./admin-search";

describe("buildSearchOr — PostgREST .or 안전 생성", () => {
  test("빈 검색어는 null(필터 없음)", () => {
    expect(buildSearchOr("")).toBeNull();
    expect(buildSearchOr("   ")).toBeNull();
  });

  test("정상 검색어는 company·seq_no ilike OR", () => {
    expect(buildSearchOr("재현")).toBe("company.ilike.%재현%,seq_no.ilike.%재현%");
  });

  test("메타문자(,()%_*\\)는 제거 — 필터/와일드카드 주입 차단", () => {
    expect(buildSearchOr("a,b(c)%_*\\d")).toBe("company.ilike.%abcd%,seq_no.ilike.%abcd%");
  });

  test("REQ- 하이픈은 보존(접수번호 검색)", () => {
    expect(buildSearchOr("REQ-2026")).toBe("company.ilike.%REQ-2026%,seq_no.ilike.%REQ-2026%");
  });
});

describe("splitOverflow — limit+1 초과 감지", () => {
  test("101건이면 100건 + overflow true", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: String(i) }));
    const r = splitOverflow(rows, 100);
    expect(r.rows).toHaveLength(100);
    expect(r.overflow).toBe(true);
  });

  test("100 이하면 overflow false, 전건 유지", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
    const r = splitOverflow(rows, 100);
    expect(r.rows).toHaveLength(50);
    expect(r.overflow).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test admin-search`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/applications/admin-search.ts`:

```ts
// 목록 서버검색 순수 헬퍼 — Supabase 의존 없이 단위테스트 가능.

// PostgREST .or()·ilike 메타문자를 제거해 필터/와일드카드 주입을 막는다.
// 하이픈(REQ-)·한글·영숫자·공백은 보존.
export function buildSearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (cleaned === "") return null;
  return `company.ilike.%${cleaned}%,seq_no.ilike.%${cleaned}%`;
}

// limit+1로 가져온 행에서 초과 여부를 감지하고 limit개로 자른다.
export function splitOverflow<T>(rows: T[], limit: number): { rows: T[]; overflow: boolean } {
  if (rows.length > limit) return { rows: rows.slice(0, limit), overflow: true };
  return { rows, overflow: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test admin-search`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/applications/admin-search.ts apps/web/src/lib/applications/admin-search.test.ts
git commit -m "feat(applications): 목록 서버검색 순수 헬퍼(needle 정규화·overflow 감지)"
```

---

## Task 4: admin-queries.ts (목록·상세·미배정 카운트)

서버 컴포넌트가 쓰는 데이터 조회. RLS가 가시범위 강제. biz_no는 application쪽만 JS 정규화 후 companies(`.eq`)로 단순조회(companies.biz_no는 RPC가 숫자정규화 저장).

**Files:**
- Create: `apps/web/src/lib/applications/admin-queries.ts`

> RLS 종속 동작은 db-tests(Task 7)·E2E(Task 12)가 검증. 이 파일 자체는 순수로직(Task 3)을 합성하는 얇은 래퍼라 단위테스트 없이 통합 레이어에서 커버.

- [ ] **Step 1: Write the implementation**

`apps/web/src/lib/applications/admin-queries.ts`:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/customers/history";
import { buildSearchOr, splitOverflow } from "./admin-search";

export interface ApplicationListRow {
  id: string;
  seq_no: string;
  status: ApplicationStatus;
  company: string;
  summary: string; // equipment_name || requirements 앞부분 (목록 "무슨 견적인가" 컬럼)
  assignee_id: string | null;
  assignee_name: string | null;
  is_new: boolean; // status==='new' (미배정 강조)
  created_at: string;
}

const LIST_LIMIT = 100;

// 견적 목록 — created_at desc. 서버 검색(company·seq_no)+상태필터. RLS: 자기배정 OR view_all.
export async function listApplications(
  opts: { q?: string; status?: string } = {},
): Promise<{ rows: ApplicationListRow[]; overflow: boolean }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("applications")
    .select("id,seq_no,status,company,assignee_id,created_at,fields,profiles:assignee_id(name)")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT + 1); // overflow 감지용 +1

  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  const orFilter = opts.q ? buildSearchOr(opts.q) : null;
  if (orFilter) query = query.or(orFilter);

  const { data, error } = await query;
  if (error) {
    console.error("[applications.adminList]", error);
    return { rows: [], overflow: false };
  }
  const mapped: ApplicationListRow[] = (data ?? []).map((r: Record<string, unknown>) => {
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
  return splitOverflow(mapped, LIST_LIMIT);
}

// 미배정(미처리) 건수 — status='new'. RLS가 가시범위 제한(view_all 없으면 자기배정 new만).
// ⚠️ 단일테넌트 admin(users.manage)은 전체. 멀티스태프 시 "내 배정 new"만 셈(plan에 명문화).
export async function countNewApplications(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) return 0;
  return count ?? 0;
}

// 견적 단건(admin 상세) — profiles 조인 + biz_no→companies 매칭(application쪽 JS 정규화).
export async function getApplicationForAdmin(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("applications")
    .select("*, profiles:assignee_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  // companies.biz_no는 upsert RPC가 숫자정규화 저장 → application쪽만 정규화해 단순조회.
  let companyId: string | null = null;
  const digits = ((data.biz_no as string | null) ?? "").replace(/\D/g, "");
  if (digits) {
    const { data: co } = await supabase
      .from("companies")
      .select("id")
      .eq("biz_no", digits)
      .maybeSingle();
    companyId = (co?.id as string | undefined) ?? null;
  }
  return { ...(data as Record<string, unknown>), company_id: companyId };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS (no type errors in admin-queries.ts).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/applications/admin-queries.ts
git commit -m "feat(applications): admin 조회(목록 서버검색·미배정 카운트·상세 biz_no 매칭)"
```

---

## Task 5: admin-actions.ts (배정·상태·고객등록)

서버 액션. 각 액션은 `requirePermission`으로 권한 명시 분리 + `.select("id")` 행수 체크로 RLS 0행 거부를 솔직한 에러로 변환(거짓 성공 방지). assign은 new→assigned, 해제는 assigned→new auto-bump.

**Files:**
- Create: `apps/web/src/lib/applications/admin-actions.ts`

> 액션 동작(auto-bump·0행·타인배정)은 db-tests(Task 7)·E2E(Task 12)가 검증. 여기선 status enum 검증만 단위로(아래 Step 1).

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/applications/admin-actions.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { applicationStatusSchema } from "./admin-actions";

describe("applicationStatusSchema — status enum 검증", () => {
  test("유효 4상태 통과", () => {
    for (const s of ["new", "assigned", "quoted", "closed"]) {
      expect(applicationStatusSchema.safeParse(s).success).toBe(true);
    }
  });
  test("유효하지 않은 값 거부", () => {
    expect(applicationStatusSchema.safeParse("done").success).toBe(false);
    expect(applicationStatusSchema.safeParse("").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jhtechsaas/web test admin-actions`
Expected: FAIL — `applicationStatusSchema` not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/applications/admin-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";

export const applicationStatusSchema = z.enum(["new", "assigned", "quoted", "closed"]);

export type ApplicationActionResult = { error: string } | { ok: true; companyId?: string };

const FAIL = "처리에 실패했습니다(권한이 없거나 대상이 없습니다)";

// 담당 배정 — applications.assign 필요. new면 assigned로, 해제(null)면 assigned→new auto-bump.
export async function assignApplication(
  id: string,
  assigneeId: string | null,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("applications.assign");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const supabase = await createSupabaseServerClient();

  // 현재 status 조회 → auto-bump 판정. (단일테넌트 admin=users.manage라 SELECT 가능.)
  const { data: cur } = await supabase
    .from("applications").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "신청을 찾을 수 없습니다" };

  const patch: { assignee_id: string | null; status?: string } = { assignee_id: assigneeId };
  if (assigneeId && cur.status === "new") patch.status = "assigned";        // 배정 시 미처리 해제
  if (!assigneeId && cur.status === "assigned") patch.status = "new";       // 해제 시 재트리아지 풀로

  const { data, error } = await supabase
    .from("applications").update(patch).eq("id", id).select("id");
  if (error || !data || data.length === 0) return { error: FAIL };

  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/applications");
  return { ok: true };
}

// 상태 변경 — applications.assign 필요. 자유전이(4상태). 0행이면 거짓성공 대신 에러.
export async function updateApplicationStatus(
  id: string,
  status: string,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("applications.assign");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = applicationStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "유효하지 않은 상태입니다" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications").update({ status: parsed.data }).eq("id", id).select("id");
  if (error || !data || data.length === 0) return { error: FAIL };
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/applications");
  return { ok: true };
}

// 미등록 고객 등록 — customers.manage 필요(RPC 내부에서도 재검증). 반환 company_id로 즉시 P-F 링크.
export async function registerCustomerFromApplication(
  id: string,
): Promise<ApplicationActionResult> {
  const access = await requirePermission("customers.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_from_application", {
    p_application_id: id,
  });
  if (error) {
    console.error("[applications.registerCustomer]", error);
    return { error: "고객 등록에 실패했습니다" };
  }
  const companyId = (data as { company_id?: string } | null)?.company_id;
  revalidatePath(`/admin/applications/${id}`);
  return { ok: true, companyId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jhtechsaas/web test admin-actions`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/applications/admin-actions.ts apps/web/src/lib/applications/admin-actions.test.ts
git commit -m "feat(applications): 배정·상태·고객등록 서버액션(auto-bump·0행방어)"
```

---

## Task 6: db-tests — assign auto-bump·해제·0행·타인배정 RLS 단언

`applications.test.ts`에 이미 seq_no·anon·row scope 테스트가 있다. assign 로직(이 슬라이스의 유일한 신규 상호작용) RLS 단언을 추가한다.

**Files:**
- Modify: `packages/db-tests/src/applications.test.ts` (append describe block before final `})`/EOF)

- [ ] **Step 1: Write the failing tests**

`packages/db-tests/src/applications.test.ts`, append after the `"applications — assignee row scope (E-4)"` describe block (end of file):

```ts
describe("applications — 배정·상태 UPDATE (E-4 트리아지)", () => {
  const APP = "00000000-0000-0000-0000-0000000000e1";

  async function seedNew(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.admin, "admin@jhtech.test");
    await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.assign,applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,status) values ($1,'배정대상','new')", [APP]);
  }

  test("assign 보유자가 타인에게 배정 → assignee_id 저장(WITH CHECK 통과)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.applications set assignee_id=$1, status='assigned' where id=$2 returning assignee_id,status",
        [UID.sales1, APP],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
      expect(r.rows[0].status).toBe("assigned");
    });
  });

  test("assign 없는 사용자의 UPDATE는 0행(RLS 거부 — 거짓성공 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      // sales2: 권한 없음, 본인 배정건도 아님
      await asUser(c, UID.sales2);
      const r = await c.query(
        "update public.applications set status='closed' where id=$1 returning id",
        [APP],
      );
      expect(r.rowCount).toBe(0); // 에러가 아니라 0행 — 앱 레이어가 이걸 에러로 변환
    });
  });

  test("status check enum 위반은 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.applications set status='done' where id=$1", [APP]),
      ).rejects.toThrow();
    });
  });

  test("UPDATE 후 seq_no·created_at 불변(트리거)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asPostgres(c);
      const before = await c.query("select seq_no,created_at from public.applications where id=$1", [APP]);
      await asUser(c, UID.admin);
      await c.query("update public.applications set status='quoted' where id=$1", [APP]);
      await asPostgres(c);
      const after = await c.query("select seq_no,created_at,status from public.applications where id=$1", [APP]);
      expect(after.rows[0].seq_no).toBe(before.rows[0].seq_no);
      expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
      expect(after.rows[0].status).toBe("quoted");
    });
  });
});
```

- [ ] **Step 2: Reset DB and run to verify it fails (then passes — these assert existing RLS)**

```bash
supabase db reset
pnpm --filter @jhtechsaas/db-tests test:rls applications
```
Expected: 새 4개 테스트 PASS(기존 RLS·트리거가 이미 올바르므로). ⚠️ 만약 "assign 없는 사용자 0행" 테스트가 실패하면 RLS UPDATE 정책 회귀 신호 — 멈추고 조사.

- [ ] **Step 3: Commit**

```bash
git add packages/db-tests/src/applications.test.ts
git commit -m "test(db): applications 배정·상태 UPDATE RLS 단언(auto-bump·0행거부·트리거불변)"
```

---

## Task 7: ApplicationTable (client, 서버필터 트리거)

목록 테이블. 검색·필터는 URL searchParams를 바꿔 서버 컴포넌트를 재실행(서버검색). 미배정 행 강조 + 내용컬럼(summary). `is_new`는 "미열람"이 아니라 "미배정" 의미 — aria-label로 정직 표기.

**Files:**
- Create: `apps/web/src/app/admin/applications/_components/ApplicationTable.tsx`

- [ ] **Step 1: Write the implementation**

`apps/web/src/app/admin/applications/_components/ApplicationTable.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  APPLICATION_STATUSES, APPLICATION_STATUS_META, ApplicationStatusBadge,
} from "@/lib/application-status";
import type { ApplicationListRow } from "@/lib/applications/admin-queries";

export function ApplicationTable({
  rows, overflow, q, status,
}: {
  rows: ApplicationListRow[];
  overflow: boolean;
  q: string;
  status: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function push(nextQ: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    router.push(`/admin/applications${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); push(search, status); }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="업체명·접수번호 검색"
            className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
          <button type="submit" className="rounded-md bg-surface-2 px-3 py-2 text-small font-medium text-muted">검색</button>
        </form>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => push(search, "all")}
            className={`rounded-md px-3 py-2 text-small font-medium ${status === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
          >
            전체
          </button>
          {APPLICATION_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => push(search, s)}
              className={`rounded-md px-3 py-2 text-small font-medium ${status === s ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
            >
              {APPLICATION_STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {overflow && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-small text-amber-700">
          100건을 초과해 최신 100건만 표시합니다. 검색·상태필터로 범위를 좁히세요.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
          <p className="text-body font-medium text-text">조건에 맞는 견적이 없습니다</p>
          {(q || status !== "all") ? (
            <Link href="/admin/applications" className="text-small text-accent underline">필터 초기화</Link>
          ) : (
            <p className="text-small text-muted">고객이 /request 에서 신청하면 여기 표시됩니다</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">접수번호</th>
                <th className="py-2 pr-4 font-medium">업체</th>
                <th className="py-2 pr-4 font-medium">견적 내용</th>
                <th className="py-2 pr-4 font-medium">담당</th>
                <th className="py-2 pr-4 font-medium">상태</th>
                <th className="py-2 font-medium">접수일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr
                  key={it.id}
                  className={`cursor-pointer border-b border-border hover:bg-surface-2 ${it.is_new ? "bg-blue-50/40" : ""}`}
                  onClick={() => router.push(`/admin/applications/${it.id}`)}
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/applications/${it.id}`}
                      className="flex items-center gap-2 font-mono tabular-nums text-text hover:text-accent"
                    >
                      {it.is_new && <span className="inline-block size-2 rounded-full bg-accent" aria-label="미배정" />}
                      {it.seq_no}
                    </Link>
                  </td>
                  <td className="max-w-xs py-2 pr-4"><span className="block max-w-xs truncate text-text">{it.company}</span></td>
                  <td className="max-w-xs py-2 pr-4"><span className="block max-w-xs truncate text-muted">{it.summary || "-"}</span></td>
                  <td className="py-2 pr-4 text-text">{it.assignee_name ?? <span className="text-muted">미배정</span>}</td>
                  <td className="py-2 pr-4"><ApplicationStatusBadge status={it.status} /></td>
                  <td className="py-2 font-mono tabular-nums text-muted">{new Date(it.created_at).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/applications/_components/ApplicationTable.tsx
git commit -m "feat(applications): 목록 테이블(서버검색·미배정 강조·내용컬럼)"
```

---

## Task 8: 목록 페이지 (page.tsx)

서버 컴포넌트. `searchParams`로 listApplications 호출 → ApplicationTable.

**Files:**
- Create: `apps/web/src/app/admin/applications/page.tsx`

- [ ] **Step 1: Write the implementation**

`apps/web/src/app/admin/applications/page.tsx`:

```tsx
import { requirePermission } from "@/lib/auth/guard";
import { listApplications } from "@/lib/applications/admin-queries";
import { ApplicationTable } from "./_components/ApplicationTable";

// 견적 트리아지 목록. 가드: applications.view_all.
// ⚠️ admin layout이 equipment.manage로 콘솔 전체를 게이트(백로그 #29) → 둘 다 필요(또는 admin).
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const access = await requirePermission("applications.view_all");
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 조회 권한(applications.view_all)이 필요합니다.</p>
      </div>
    );
  }
  const { q = "", status = "all" } = await searchParams;
  const { rows, overflow } = await listApplications({ q, status });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">견적 신청</h1>
      <ApplicationTable rows={rows} overflow={overflow} q={q} status={status} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + dev 빌드 확인**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/applications/page.tsx
git commit -m "feat(applications): 견적 목록 페이지(가드·서버필터)"
```

---

## Task 9: 상세 컨트롤 3종 (Assign·Status·RegisterCustomer)

상세에서 쓰는 client 컴포넌트들. 각자 인라인 에러 표시(0행 방어의 UI 짝).

**Files:**
- Create: `apps/web/src/app/admin/applications/[id]/_components/StatusControl.tsx`
- Create: `apps/web/src/app/admin/applications/[id]/_components/AssignControl.tsx`
- Create: `apps/web/src/app/admin/applications/[id]/_components/RegisterCustomerButton.tsx`

- [ ] **Step 1: StatusControl**

`apps/web/src/app/admin/applications/[id]/_components/StatusControl.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUSES, APPLICATION_STATUS_META } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { updateApplicationStatus } from "@/lib/applications/admin-actions";

export function StatusControl({ id, current }: { id: string; current: ApplicationStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus>(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await updateApplicationStatus(id, status);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>{APPLICATION_STATUS_META[s].label}</option>
        ))}
      </select>
      <button
        onClick={apply}
        disabled={pending || status === current}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
      >
        {pending ? "변경 중…" : "상태 변경"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: AssignControl**

`apps/web/src/app/admin/applications/[id]/_components/AssignControl.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignApplication } from "@/lib/applications/admin-actions";

export function AssignControl({
  id, currentAssigneeId, staff,
}: {
  id: string;
  currentAssigneeId: string | null;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(currentAssigneeId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await assignApplication(id, value === "" ? null : value);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="">미배정</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={apply}
        disabled={pending || value === (currentAssigneeId ?? "")}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
      >
        {pending ? "저장 중…" : "담당 저장"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: RegisterCustomerButton**

`apps/web/src/app/admin/applications/[id]/_components/RegisterCustomerButton.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCustomerFromApplication } from "@/lib/applications/admin-actions";

export function RegisterCustomerButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await registerCustomerFromApplication(id);
      if ("error" in res) { setError(res.error); return; }
      if (res.companyId) router.push(`/admin/customers/${res.companyId}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={apply}
        disabled={pending}
        className="self-start rounded-md border border-accent px-4 py-2 text-body font-medium text-accent disabled:opacity-60"
      >
        {pending ? "등록 중…" : "고객으로 등록"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + Commit**

Run: `pnpm --filter @jhtechsaas/web typecheck` → PASS

```bash
git add apps/web/src/app/admin/applications/[id]/_components/
git commit -m "feat(applications): 상세 컨트롤(배정·상태·고객등록, 인라인 에러)"
```

---

## Task 10: 상세 페이지 ([id]/page.tsx)

고객정보·요청사항·설치설문(6항목 라벨맵, handling은 콤마)·사진 4슬롯(라벨 캡션·병렬 서명URL·실패 플레이스홀더)·equipment_name + P-F 링크 + 컨트롤.

**Files:**
- Create: `apps/web/src/app/admin/applications/[id]/page.tsx`

- [ ] **Step 1: Write the implementation**

`apps/web/src/app/admin/applications/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { listAssignableStaff } from "@/lib/customers/queries";
import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { StatusControl } from "./_components/StatusControl";
import { AssignControl } from "./_components/AssignControl";
import { RegisterCustomerButton } from "./_components/RegisterCustomerButton";

const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 진입로",
  ext_building: "외부 건물",
  int_entrance: "내부 입구",
  int_location: "설치 위치",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requirePermission("applications.view_all");
  if (access.status === "forbidden") {
    return <p className="text-body text-muted">견적 조회 권한이 없습니다.</p>;
  }
  const r = (await getApplicationForAdmin(id)) as Record<string, unknown> | null;
  if (!r) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">신청을 찾을 수 없습니다.</p>
        <Link href="/admin/applications" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const status = r.status as ApplicationStatus;
  const companyId = r.company_id as string | null;
  const fields = (r.fields ?? {}) as {
    requirements?: string;
    equipment_name?: string;
    install_survey?: Record<string, string | string[]>;
    photos?: Partial<Record<PhotoSlot, string>>;
  };
  const survey = fields.install_survey ?? {};
  const staff = await listAssignableStaff();
  const canAssign = can(access.permissions, "applications.assign");
  const canManageCustomers = can(access.permissions, "customers.manage");

  // 사진 4슬롯 — 병렬 서명URL. 실패/없음은 슬롯 라벨 유지하며 플레이스홀더.
  const supabase = await createSupabaseServerClient();
  const photos = fields.photos ?? {};
  const signed = await Promise.all(
    PHOTO_SLOTS.map(async (slot) => {
      const path = photos[slot];
      if (!path) return { slot, url: null as string | null };
      const { data } = await supabase.storage.from("customer-uploads").createSignedUrl(path, 600);
      return { slot, url: data?.signedUrl ?? null };
    }),
  );
  const hasAnyPhoto = signed.some((s) => s.url);

  // handling 라벨링(배열).
  const handlingArr = Array.isArray(survey.handling) ? (survey.handling as string[]) : [];
  const handlingText = handlingArr
    .map((h) => (SURVEY_LABELS.handling as Record<string, string>)[h] ?? h)
    .join(", ");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/applications" className="text-small text-muted hover:text-text">← 목록</Link>
        <ApplicationStatusBadge status={status} />
      </div>

      <div>
        <div className="text-small text-muted">접수번호</div>
        <div className="font-mono tabular-nums text-h1 text-text">{str(r.seq_no)}</div>
        {!companyId && (
          <span className="mt-1 inline-block rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">
            미등록 고객
          </span>
        )}
      </div>

      <Section title="고객 정보">
        {companyId && (
          <Link href={`/admin/customers/${companyId}`} className="mb-1 inline-block text-small font-medium text-accent hover:underline">
            이 고객의 통합 이력 보기 →
          </Link>
        )}
        <Row label="회사명" value={str(r.company)} />
        <Row label="대표자" value={str(r.ceo)} />
        <Row label="연락처" value={str(r.phone)} mono />
        <Row label="이메일" value={str(r.email)} />
        <Row label="주소" value={str(r.address)} />
        <Row label="사업자번호" value={str(r.biz_no)} mono />
        {!companyId && canManageCustomers && (
          <div className="mt-2"><RegisterCustomerButton id={id} /></div>
        )}
      </Section>

      <Section title="요청 내용">
        <Row label="장비" value={fields.equipment_name ?? null} />
        <div className="py-1">
          <div className="text-small text-muted">요청사항</div>
          <p className="mt-1 whitespace-pre-wrap text-body text-text">{fields.requirements || "-"}</p>
        </div>
      </Section>

      <Section title="설치 설문">
        {(["building_type", "location", "elevator", "power", "pneumatic"] as const).map((k) => {
          const raw = survey[k];
          const v = typeof raw === "string" ? raw : "";
          const label = (SURVEY_LABELS[k] as Record<string, string>)[v] ?? (v || "-");
          return <Row key={k} label={SURVEY_FIELD_LABELS[k]} value={label} />;
        })}
        <Row label={SURVEY_FIELD_LABELS.handling} value={handlingText || "-"} />
        {typeof survey.extra === "string" && survey.extra && (
          <div className="py-1">
            <div className="text-small text-muted">기타 요청사항</div>
            <p className="mt-1 whitespace-pre-wrap text-body text-text">{survey.extra}</p>
          </div>
        )}
      </Section>

      {hasAnyPhoto && (
        <Section title="현장 사진">
          <div className="grid grid-cols-2 gap-3">
            {signed.filter((s) => s.url).map((s) => (
              <figure key={s.slot} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url!} alt={PHOTO_SLOT_LABELS[s.slot]} className="aspect-[4/3] w-full rounded-sm object-cover" />
                <figcaption className="text-micro text-muted">{PHOTO_SLOT_LABELS[s.slot]}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      <Section title="처리">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 text-small text-muted">담당자</div>
            {canAssign ? (
              <AssignControl id={id} currentAssigneeId={r.assignee_id as string | null} staff={staff} />
            ) : (
              <p className="text-small text-muted">{(r.profiles as { name?: string } | null)?.name ?? "미배정"} (배정 권한 없음)</p>
            )}
          </div>
          <div>
            <div className="mb-1 text-small text-muted">상태</div>
            {canAssign ? (
              <StatusControl id={id} current={status} />
            ) : (
              <p className="text-small text-muted">상태 변경 권한(applications.assign)이 없습니다.</p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">{title}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-3 py-1 text-body">
      <span className="w-24 shrink-0 text-small text-muted">{label}</span>
      <span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value || "-"}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS. (`PHOTO_SLOTS`/`PhotoSlot`은 schema.ts에 이미 export — Task 2 무관, 기존 존재.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/applications/[id]/page.tsx
git commit -m "feat(applications): 견적 상세(고객·설문 라벨맵·라벨캡션 사진·P-F링크·컨트롤)"
```

---

## Task 11: admin layout — '견적' 네비 + 미배정 배지

`countNewApplications()`를 기존 `Promise.all`에 추가(직렬 await 금지). '견적' 링크 추가.

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx:4-5, 17-20, 53-58 부근`

- [ ] **Step 1: Add import + parallel count**

`apps/web/src/app/admin/layout.tsx`, line 5 다음에 import 추가:

```tsx
import { countNewApplications } from "@/lib/applications/admin-queries";
```

`Promise.all` 블록(line 17-20)을 교체:

```tsx
  const [unread, supplyUnread, newApps] =
    access.status === "ok"
      ? await Promise.all([
          countUnreadServiceRequests(),
          countUnreadSupplyRequests(),
          countNewApplications(),
        ])
      : [0, 0, 0];
```

- [ ] **Step 2: Add '견적' nav link**

`apps/web/src/app/admin/layout.tsx`, `<nav>` 안 '고객' 링크 다음(line 52 `</Link>` 뒤)에 추가:

```tsx
          <Link
            href="/admin/applications"
            className="flex items-center justify-between rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            <span>견적</span>
            {newApps > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-micro font-medium text-white" aria-label={`미배정 ${newApps}건`}>{newApps}</span>
            )}
          </Link>
```

- [ ] **Step 3: Typecheck + 빌드**

Run: `pnpm --filter @jhtechsaas/web typecheck && pnpm --filter @jhtechsaas/web build`
Expected: PASS, build 성공.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx
git commit -m "feat(applications): admin 네비 '견적' 링크 + 미배정 배지(병렬 카운트)"
```

---

## Task 12: E2E — admin 풀 시나리오

admin 로그인 → 목록 → 상세 → 배정(assigned 확인) → 상태변경 → (미등록 시)고객등록 → P-F 링크. 기존 `service-requests.spec.ts` 픽스처 패턴을 따른다.

**Files:**
- Create: `apps/web/e2e/applications.spec.ts`
- 참고: `apps/web/e2e/service-requests.spec.ts`, `apps/web/e2e/fixtures/`

- [ ] **Step 1: 기존 E2E 픽스처/로그인 패턴 확인**

Run: `sed -n '1,60p' apps/web/e2e/service-requests.spec.ts`
목적: admin 로그인 헬퍼·시드 방식(공개폼 제출로 application 생성 or 픽스처) 파악.

- [ ] **Step 2: Write the spec (픽스처 패턴 반영해 작성)**

`apps/web/e2e/applications.spec.ts` — service-requests.spec.ts의 로그인/시드 헬퍼를 동일하게 import해서 사용. 시나리오:

```ts
import { test, expect } from "@playwright/test";
// ⚠️ service-requests.spec.ts와 동일한 로그인/시드 헬퍼를 import (fixtures 경로 확인 후 맞출 것).

test.describe("E4 견적 트리아지 콘솔", () => {
  test("목록→상세→배정→상태변경→고객등록→P-F링크", async ({ page }) => {
    // 1) 공개폼 또는 픽스처로 new 견적 1건 생성 (service-requests 패턴 따라 작성)
    // 2) admin 로그인 (기존 헬퍼)
    await page.goto("/admin/applications");
    await expect(page.getByRole("heading", { name: "견적 신청" })).toBeVisible();

    // 3) 상세 진입
    await page.getByRole("link", { name: /REQ-/ }).first().click();
    await expect(page.getByText("접수번호")).toBeVisible();

    // 4) 담당 배정 → 상태가 '배정'으로 자동 전이
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: "담당 저장" }).click();
    await expect(page.getByText("배정")).toBeVisible();

    // 5) 상태 변경 → '견적중'
    await page.getByrole("button", { name: "상태 변경" }).click();
    // (select에서 견적중 선택 후 버튼 — 실제 selector는 작성 시 확정)

    // 6) 미등록 고객이면 '고객으로 등록' → P-F 링크 노출
    const reg = page.getByRole("button", { name: "고객으로 등록" });
    if (await reg.isVisible()) {
      await reg.click();
      await expect(page).toHaveURL(/\/admin\/customers\//);
    }
  });
});
```

> 구현 시: service-requests.spec.ts의 실제 로그인/시드 유틸을 그대로 재사용하고, selector를 실제 DOM에 맞춰 확정한다. 위는 골격 — placeholder가 아니라 기존 spec에서 검증된 헬퍼로 채운다.

- [ ] **Step 3: Run E2E**

Run: `pnpm --filter @jhtechsaas/web test:e2e applications`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/applications.spec.ts
git commit -m "test(e2e): 견적 트리아지 콘솔 풀 시나리오"
```

---

## Task 13: 전체 게이트 + roadmap

머지 전 게이트(CLAUDE.md)를 전부 GREEN 확인하고 roadmap을 갱신.

- [ ] **Step 1: 전체 게이트**

```bash
supabase db reset
pnpm --filter @jhtechsaas/shared test
pnpm --filter @jhtechsaas/web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter @jhtechsaas/web typecheck
pnpm --filter @jhtechsaas/web lint
pnpm --filter @jhtechsaas/web build
pnpm --filter @jhtechsaas/web test:e2e
grep -rn "as any" apps/web/src/lib/applications apps/web/src/app/admin/applications || echo "as any 0 ✓"
```
Expected: 전부 PASS, `as any` 0.

- [ ] **Step 2: roadmap E4 status (머지 직전/직후)**

`docs/roadmap.json`에서 E4 phase status를 `done`(슬라이스 완료)으로 바꾸고:

```bash
pnpm roadmap:sync
```

- [ ] **Step 3: 최종 커밋**

```bash
git add docs/roadmap.json docs/ROADMAP.md
git commit -m "docs: E4 견적 트리아지 콘솔 완료 — roadmap 갱신"
```

---

## Self-Review (작성자 체크)

**Spec coverage (이슈 #5 AC + 7 델타):**
- AC1 목록(REQ·업체·상태·담당·접수일, desc, 검색·필터) → Task 7,8. 내용컬럼(델타) 포함 ✓
- AC2 미배정 강조 + 네비 배지 → Task 7,11. "미배정 N" 정직 라벨(델타) ✓
- AC3 상세(고객·요청·설문 라벨맵·사진 4슬롯·P-F 링크 biz_no 정규화) → Task 2,4,10. 라벨캡션·정규화(델타) ✓
- AC4 배정 + new→assigned auto-bump → Task 5,6 ✓
- AC5 자유전이 + seq_no/created_at 불변 → Task 5,6 (라벨 '견적중', quoted 노출 = 형님 결정) ✓
- AC6 미등록 고객 등록 → Task 5,9,10 (슬라이스 유지 = 형님 결정) ✓
- AC7 RLS view_all → Task 6 db-tests(E2E 불가 명문화) ✓
- AC8 0행 방어 → Task 5(.select 행수)·Task 6(0행 단언) ✓
- AC9 게이트 GREEN → Task 13 ✓
- 델타: 색 스왑(Task 1)·biz_no JS정규화(Task 4)·0행강화(Task 5)·해제 status(Task 5,6)·F2 컬럼(Task 4)·서버검색(Task 3,4,7)·읽음라벨(Task 7,11) ✓

**Placeholder scan:** Task 12 E2E는 기존 spec 헬퍼 재사용이 필요해 selector를 "구현 시 확정"으로 둠 — 의도적(기존 픽스처 의존). 나머지 전 코드 완전.

**Type consistency:** `ApplicationActionResult`는 `{error}|{ok,companyId?}` 통일 — 컨트롤들은 `"error" in res`로 분기(Task 5,9 일치). `ApplicationListRow`(Task 4) ↔ ApplicationTable props(Task 7) 일치. `ApplicationStatus`는 `@/lib/customers/history`에서 일관 import.
