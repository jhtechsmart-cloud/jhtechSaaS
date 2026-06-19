# 견적서 PDF 사양 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장비 사양을 항목별로 골라 견적서 PDF에 넣고(장비 기본 + 견적별 가감), 한 페이지를 넘지 않게 한다.

**Architecture:** 사양 항목에 안정 id·pdf 플래그를 추가하고, 견적은 spec_selection(id 배열)을 저장한다. 워커는 순수함수 `selectPdfSpecItems`(3단 폴백)로 렌더 항목을 거르고, 견적 폼은 `specBudget` 순수함수로 한 페이지 하드캡을 실시간 계산한다.

**Tech Stack:** TypeScript, Next.js(App Router), Supabase(Postgres RPC·RLS), Vitest, Playwright(E2E), puppeteer-core(워커 PDF).

## Global Constraints

- 코드 주석은 한국어. 영어 직역 말투 금지.
- `as any` 0개. 불가피하면 주석으로 이유 명시.
- DB 변경은 migration 파일로만. 롤백은 `supabase/rollback/`(단수)에 `<timestamp>_<name>_down.sql`.
- 마이그레이션 = 한 가지 의도만. id backfill / spec_selection 컬럼은 별도 파일.
- Zod `z.object`는 미정의 키 strip → 보존할 키(`id`·`pdf`·`spec_selection`)는 스키마에 명시.
- 새 기능은 테스트 먼저(TDD). 순수 로직 = Vitest, RLS = `packages/db-tests`, UI 회귀 = Playwright E2E.
- 게이트(머지 전 전부 GREEN): `pnpm --filter @jhtechsaas/shared test` · `pnpm --filter web test` · `pnpm --filter @jhtechsaas/db-tests test:rls` · `pnpm --filter web typecheck` · `pnpm --filter web lint` · `pnpm --filter web build` · `pnpm --filter web test:e2e`.
- db-tests/e2e 전 `supabase db reset` + `bash supabase/seed/seed-local.sh`(시드 복구). 데모/샘플 데이터 없는 클린 상태에서만.
- 시각 검증은 PNG/PDF를 cat/grep 금지 — 반드시 Read 도구.
- 머지 후 `supabase db push`(prod ref `okxmeqrvtlvmxfltsara`).

---

## 핵심 설계 정밀화 (구현 전 필독)

`null` vs `[]`와 폼 기본 선택의 일관성:

- **`selectPdfSpecItems(specGroups, specSelection)`** 폴백:
  - `specSelection`이 **배열**이면 → 그 id에 해당하는 항목만(빈배열 `[]` = 0개 렌더).
  - `specSelection`이 **`null`/`undefined`**(= 구 견적)이면 → `pdf:true` 항목만. `pdf:true`가 하나도 없으면 → 전체(현 동작).
- **`defaultSpecSelection(specGroups)`** (폼 새 견적 기본값): `pdf:true` 항목 id들. 단 **하나도 flagged 안 됐으면 전체 항목 id**를 반환. → 미설정 장비도 새 견적에서 "전체 렌더(현 동작)"가 기본이 되고, 관리자가 체크 해제로 줄인다.
- 폼은 항상 배열을 저장하므로 `null`은 **구 견적에만** 존재. 신규 견적의 미설정 장비는 `[]`가 아니라 전체 id 배열을 저장 → "render nothing" 함정 회피.

이 두 함수는 `pdf:true 있으면 그것, 없으면 전체`라는 동일 로직을 공유한다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `packages/shared/src/specs.ts` | SpecItem 타입(id·pdf), parse/serialize id 부여, `selectPdfSpecItems`, `defaultSpecSelection` | Modify |
| `packages/shared/src/specs.test.ts` | 위 순수함수 테스트 | Create |
| `packages/shared/src/spec-budget.ts` | `specBudget` 한 페이지 예산 순수함수 | Create |
| `packages/shared/src/spec-budget.test.ts` | 예산 테스트 | Create |
| `packages/shared/src/index.ts` | 신규 export | Modify |
| `supabase/migrations/<ts>_spec_item_ids.sql` | equipment.specs 항목 id backfill | Create |
| `supabase/migrations/<ts>_quotes_spec_selection.sql` | quotes.spec_selection 컬럼 | Create |
| `supabase/migrations/<ts>_quote_create_rpc_spec.sql` | create_quote/_manual/_insert에 spec_selection 인자 | Create |
| `supabase/rollback/<ts>_*_down.sql` × 3 | 각 롤백 | Create |
| `apps/web/src/lib/equipment/schema.ts` | specItemSchema에 id·pdf | Modify |
| `apps/web/src/app/admin/equipment/_components/SpecEditor.tsx` | 항목 pdf 체크박스 | Modify |
| `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` | 신규 항목 기본값 id·pdf | Modify |
| `apps/web/src/lib/quotes/form.ts` | QuoteCatalogItem.specs, spec_selection 헬퍼 | Modify |
| `apps/web/src/lib/quotes/equipment-match.server.ts` | 카탈로그에 specs 로드 | Modify |
| `apps/web/src/lib/quotes/schema.ts` | createQuotePayload에 spec_selection | Modify |
| `apps/web/src/lib/quotes/actions.ts` | RPC 호출에 p_spec_selection | Modify |
| `apps/web/src/app/admin/_components/SpecSelectionEditor.tsx` | 견적 사양 선택 + 하드캡 UI | Create |
| `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx` | 사양 선택 상태·전달 | Modify |
| `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx` | 동일 | Modify |
| `apps/web/src/app/admin/applications/[id]/quote/new/page.tsx` | 재발행 spec_selection 프리필 | Modify |
| `apps/worker/src/jobs/quote-pdf.ts` | id·pdf 보존 + spec_selection 조회 + 필터 | Modify |

---

## Task 1: SpecItem 타입 확장 + parse/serialize id 부여

**Files:**
- Modify: `packages/shared/src/specs.ts`
- Test: `packages/shared/src/specs.test.ts` (Create)

**Interfaces:**
- Produces: `interface SpecItem { id: string; label: string; value: string; pdf?: boolean }`, `parseSpecs(raw): SpecGroup[]`(id 보존, 없으면 빈 문자열), `serializeSpecs(groups): SpecGroup[]`(id 없는 항목에 id 부여), `genSpecItemId(): string`.

- [ ] **Step 1: 실패 테스트 작성** — `packages/shared/src/specs.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseSpecs, serializeSpecs } from "./specs";

describe("parseSpecs — id·pdf 보존", () => {
  it("그룹형 항목의 id·pdf를 그대로 읽는다", () => {
    const raw = [{ group: "성능", icon: "gauge", items: [{ id: "a1", label: "속도", value: "30", pdf: true }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "성능", icon: "gauge", items: [{ id: "a1", label: "속도", value: "30", pdf: true }] },
    ]);
  });
  it("id 없는 레거시 항목은 빈 id·pdf undefined로 읽는다(렌더는 동작)", () => {
    const raw = [{ group: "", icon: "settings", items: [{ label: "속도", value: "30" }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "", icon: "settings", items: [{ id: "", label: "속도", value: "30" }] },
    ]);
  });
});

describe("serializeSpecs — id 부여·pdf 보존", () => {
  it("id 없는 항목에 새 id를 부여한다", () => {
    const out = serializeSpecs([{ group: "성능", icon: "gauge", items: [{ id: "", label: "속도", value: "30", pdf: true }] }]);
    expect(out[0]!.items[0]!.id).toMatch(/.+/);
    expect(out[0]!.items[0]!.pdf).toBe(true);
  });
  it("기존 id는 유지한다(연결 보존)", () => {
    const out = serializeSpecs([{ group: "성능", icon: "gauge", items: [{ id: "keep-1", label: "속도", value: "30" }] }]);
    expect(out[0]!.items[0]!.id).toBe("keep-1");
  });
  it("pdf=false는 보존, pdf 미지정은 미포함", () => {
    const out = serializeSpecs([{ group: "G", icon: "settings", items: [
      { id: "x", label: "a", value: "1", pdf: false },
      { id: "y", label: "b", value: "2" },
    ] }]);
    expect(out[0]!.items[0]!.pdf).toBe(false);
    expect(out[0]!.items[1]!.pdf).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test specs`
Expected: FAIL (id 필드 없음 / serializeSpecs가 id 미부여)

- [ ] **Step 3: specs.ts 수정**

`SpecItem` 인터페이스(라인 9-12)를 교체:
```ts
export interface SpecItem {
  id: string; // 안정 고유표식 — 견적 spec_selection이 이 id로 항목을 가리킨다(레거시는 빈 문자열, serialize 시 채움)
  label: string;
  value: string;
  pdf?: boolean; // 견적서 PDF 기본 포함 여부(장비 기본값). 견적별 가감은 quotes.spec_selection.
}
```

`parseItems`(라인 27-35)를 교체 — id·pdf 보존:
```ts
// 배열 원소를 SpecItem[] 로 변환. {label, value} 형태만 허용. id·pdf는 있으면 보존.
function parseItems(raw: unknown): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      label: String(r.label),
      value: String(r.value),
      ...(typeof r.pdf === "boolean" ? { pdf: r.pdf } : {}),
    }));
}
```

`serializeSpecs`(라인 63-73)를 교체 — id 부여·pdf 보존:
```ts
// 결정적이지 않은 id 생성. crypto.randomUUID 사용(노드·브라우저·워커 공통).
export function genSpecItemId(): string {
  return crypto.randomUUID();
}

// SpecGroup[] → DB 저장용. 빈 아이템 제거·트림, 아이템 0개 그룹 제거, 순서 보존.
// id 없는 항목엔 id 부여(연결 안정성), pdf 플래그 보존.
export function serializeSpecs(groups: SpecGroup[]): SpecGroup[] {
  return groups
    .map((g) => ({
      group: g.group.trim(),
      icon: g.icon,
      items: g.items
        .map((i) => ({
          id: i.id && i.id.length > 0 ? i.id : genSpecItemId(),
          label: i.label.trim(),
          value: i.value.trim(),
          ...(typeof i.pdf === "boolean" ? { pdf: i.pdf } : {}),
        }))
        .filter((i) => i.label !== "" || i.value !== ""),
    }))
    .filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test specs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/specs.ts packages/shared/src/specs.test.ts
git commit -m "feat: SpecItem에 id·pdf 추가 — parse/serialize id 부여·보존"
```

---

## Task 2: selectPdfSpecItems + defaultSpecSelection 순수함수

**Files:**
- Modify: `packages/shared/src/specs.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/specs.test.ts`

**Interfaces:**
- Consumes: `SpecGroup`, `SpecItem` (Task 1)
- Produces:
  - `selectPdfSpecItems(groups: SpecGroup[], specSelection: string[] | null | undefined): SpecGroup[]` — 렌더 항목만 남긴 그룹(빈 그룹 제거)
  - `defaultSpecSelection(groups: SpecGroup[]): string[]` — 폼 새 견적 기본 선택 id 배열

- [ ] **Step 1: 실패 테스트 작성** — `specs.test.ts`에 추가

```ts
import { selectPdfSpecItems, defaultSpecSelection } from "./specs";

const G = [
  { group: "성능", icon: "gauge" as const, items: [
    { id: "a", label: "속도", value: "30", pdf: true },
    { id: "b", label: "해상도", value: "1200" },
  ] },
  { group: "크기", icon: "ruler" as const, items: [
    { id: "c", label: "무게", value: "85", pdf: true },
  ] },
];

describe("selectPdfSpecItems — 3단 폴백", () => {
  it("배열이면 그 id만 남긴다(빈 그룹 제거)", () => {
    const out = selectPdfSpecItems(G, ["a"]);
    expect(out).toEqual([{ group: "성능", icon: "gauge", items: [{ id: "a", label: "속도", value: "30", pdf: true }] }]);
  });
  it("빈 배열이면 아무 항목도 남기지 않는다", () => {
    expect(selectPdfSpecItems(G, [])).toEqual([]);
  });
  it("null이면 pdf:true 항목만(구 견적 폴백)", () => {
    const out = selectPdfSpecItems(G, null);
    expect(out.flatMap((g) => g.items.map((i) => i.id))).toEqual(["a", "c"]);
  });
  it("null이고 pdf:true가 하나도 없으면 전체(현 동작)", () => {
    const none = [{ group: "G", icon: "settings" as const, items: [{ id: "x", label: "a", value: "1" }, { id: "y", label: "b", value: "2" }] }];
    expect(selectPdfSpecItems(none, null).flatMap((g) => g.items.map((i) => i.id))).toEqual(["x", "y"]);
  });
});

describe("defaultSpecSelection — 폼 기본 선택", () => {
  it("pdf:true 항목 id들을 반환", () => {
    expect(defaultSpecSelection(G)).toEqual(["a", "c"]);
  });
  it("flagged 항목 없으면 전체 id(미설정 장비도 현 동작 유지)", () => {
    const none = [{ group: "G", icon: "settings" as const, items: [{ id: "x", label: "a", value: "1" }, { id: "y", label: "b", value: "2" }] }];
    expect(defaultSpecSelection(none)).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test specs`
Expected: FAIL ("selectPdfSpecItems is not a function")

- [ ] **Step 3: specs.ts에 함수 추가**

```ts
// 견적 PDF에 렌더할 사양 항목만 거른다. 빈 그룹은 제거.
// 폴백: 배열이면 그 id만 / null이면 pdf:true만(없으면 전체=현 동작).
export function selectPdfSpecItems(
  groups: SpecGroup[],
  specSelection: string[] | null | undefined,
): SpecGroup[] {
  const keep = (item: SpecItem): boolean => {
    if (Array.isArray(specSelection)) return specSelection.includes(item.id);
    return false; // null 분기는 아래에서 pdf/전체로 처리
  };
  if (Array.isArray(specSelection)) {
    return groups
      .map((g) => ({ ...g, items: g.items.filter(keep) }))
      .filter((g) => g.items.length > 0);
  }
  // null/undefined = 구 견적: pdf:true 항목만, 하나도 없으면 전체.
  const anyFlagged = groups.some((g) => g.items.some((i) => i.pdf === true));
  return groups
    .map((g) => ({ ...g, items: anyFlagged ? g.items.filter((i) => i.pdf === true) : g.items }))
    .filter((g) => g.items.length > 0);
}

// 폼 새 견적 기본 선택 = pdf:true 항목 id들. flagged 없으면 전체 id(미설정 장비 = 현 동작 유지).
export function defaultSpecSelection(groups: SpecGroup[]): string[] {
  const flagged = groups.flatMap((g) => g.items.filter((i) => i.pdf === true).map((i) => i.id));
  if (flagged.length > 0) return flagged;
  return groups.flatMap((g) => g.items.map((i) => i.id));
}
```

- [ ] **Step 4: index.ts에 export 추가**

`packages/shared/src/index.ts`에 `selectPdfSpecItems`, `defaultSpecSelection`, `genSpecItemId`이 포함되도록. specs.ts를 `export * from "./specs"`로 내보내고 있으면 자동 — 확인:

Run: `grep -n "specs" packages/shared/src/index.ts`
없으면 추가: `export * from "./specs";`

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test specs`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/specs.ts packages/shared/src/index.ts packages/shared/src/specs.test.ts
git commit -m "feat: selectPdfSpecItems(3단 폴백)·defaultSpecSelection 순수함수"
```

---

## Task 3: specBudget 한 페이지 예산 순수함수

**Files:**
- Create: `packages/shared/src/spec-budget.ts`
- Create: `packages/shared/src/spec-budget.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `specBudget(input: { itemCount: number; includedCount: number; extraCount: number }): number` — 사양에 쓸 수 있는 최대 "사양 항목 줄 수"(2열이므로 항목 2개 = 1줄). 보수적 정수, 최소 0.
  - `countSpecLines(groups: SpecGroup[]): number` — 선택된 그룹들이 차지하는 줄 수(그룹 제목 줄 + 항목 2열 줄). 예산과 비교용.

- [ ] **Step 1: 실패 테스트 작성** — `spec-budget.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { specBudget, countSpecLines } from "./spec-budget";

describe("specBudget — 한 페이지 예산", () => {
  it("품목·옵션이 적으면 사양 여유가 크다", () => {
    const small = specBudget({ itemCount: 1, includedCount: 0, extraCount: 0 });
    const big = specBudget({ itemCount: 6, includedCount: 8, extraCount: 6 });
    expect(small).toBeGreaterThan(big);
  });
  it("음수로 내려가지 않는다(0 하한)", () => {
    expect(specBudget({ itemCount: 50, includedCount: 50, extraCount: 50 })).toBe(0);
  });
  it("기본 견적(품목1·옵션 약간)은 양수 예산", () => {
    expect(specBudget({ itemCount: 1, includedCount: 3, extraCount: 1 })).toBeGreaterThan(0);
  });
});

describe("countSpecLines — 선택 그룹 줄 수", () => {
  it("그룹 1개 + 항목 4개(2열) = 제목1 + 항목2줄 = 3", () => {
    const g = [{ group: "성능", icon: "gauge" as const, items: [
      { id: "a", label: "1", value: "1" }, { id: "b", label: "2", value: "2" },
      { id: "c", label: "3", value: "3" }, { id: "d", label: "4", value: "4" },
    ] }];
    expect(countSpecLines(g)).toBe(3);
  });
  it("빈 선택 = 0줄", () => {
    expect(countSpecLines([])).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test spec-budget`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: spec-budget.ts 작성**

```ts
// 견적서 한 페이지 예산 — 사양에 쓸 수 있는 최대 줄 수를 추정한다.
// ⚠️ 픽셀 정확 불가(PDF는 워커 puppeteer가 나중 렌더). 보수적 추정 + 워커 truncate 안전망.
// 상수는 실제 PDF(_render-sample.ts) 대조로 튜닝. 줄 = 사양 2열 한 행 또는 그룹 제목 한 행.
import type { SpecGroup } from "./specs";

// A4 본문에서 사양 영역에 배정 가능한 총 줄 수(고정 헤더·공급자·합계·하단 장비사진 제외 후).
const TOTAL_SPEC_LINES = 16;
// 품목/옵션 한 줄이 사양 영역을 잠식하는 환산 계수(보수적).
const PER_ITEM = 1;
const PER_INCLUDED = 0.5; // 포함옵션은 한 박스에 묶여 덜 잠식
const PER_EXTRA = 1;

export function specBudget(input: {
  itemCount: number;
  includedCount: number;
  extraCount: number;
}): number {
  const used =
    input.itemCount * PER_ITEM +
    input.includedCount * PER_INCLUDED +
    input.extraCount * PER_EXTRA;
  return Math.max(0, Math.floor(TOTAL_SPEC_LINES - used));
}

// 선택된 그룹들이 차지하는 줄 수 = Σ(그룹 제목 1줄 + ceil(항목수/2)).
export function countSpecLines(groups: SpecGroup[]): number {
  return groups.reduce((acc, g) => {
    if (g.items.length === 0) return acc;
    return acc + 1 + Math.ceil(g.items.length / 2);
  }, 0);
}
```

- [ ] **Step 4: index.ts export 추가**

`packages/shared/src/index.ts`에 추가:
```ts
export * from "./spec-budget";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test spec-budget`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/spec-budget.ts packages/shared/src/spec-budget.test.ts packages/shared/src/index.ts
git commit -m "feat: specBudget·countSpecLines 한 페이지 예산 순수함수"
```

---

## Task 4: 마이그레이션 — 사양 항목 id backfill

**Files:**
- Create: `supabase/migrations/<ts>_spec_item_ids.sql`
- Create: `supabase/rollback/<ts>_spec_item_ids_down.sql`

`<ts>` = 직전 마이그레이션보다 큰 KST timestamp(예: `20260619100000`). 실제 값은 `ls supabase/migrations/ | tail -3`로 마지막을 확인해 +1초 이상으로.

**Interfaces:**
- Produces: 기존 `equipment.specs`의 모든 항목에 `id`(gen_random_uuid) 부여. `pdf`는 건드리지 않음(미설정 = 폴백).

- [ ] **Step 1: 마지막 마이그레이션 timestamp 확인**

Run: `ls supabase/migrations/ | tail -3`
직후 timestamp를 정해 아래 `<ts>` 대신 사용.

- [ ] **Step 2: 마이그레이션 작성** — `supabase/migrations/<ts>_spec_item_ids.sql`

```sql
-- 견적서 PDF 사양 선택 #1 — 기존 equipment.specs 항목에 안정 id 부여.
-- specs = jsonb [{group, icon, items:[{label,value}]}]. 각 item에 id(uuid)를 채운다.
-- 이미 id 있는 항목은 보존. pdf 플래그는 건드리지 않음(미설정=워커 폴백으로 전체 렌더).
update public.equipment e
set specs = (
  select jsonb_agg(
    jsonb_set(
      grp,
      '{items}',
      (
        select coalesce(jsonb_agg(
          case
            when (item ? 'id') and nullif(item ->> 'id', '') is not null then item
            else item || jsonb_build_object('id', gen_random_uuid()::text)
          end
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) item
      )
    )
  )
  from jsonb_array_elements(e.specs) grp
)
where jsonb_typeof(e.specs) = 'array' and jsonb_array_length(e.specs) > 0;
```

- [ ] **Step 3: 롤백 작성** — `supabase/rollback/<ts>_spec_item_ids_down.sql`

```sql
-- 롤백 — 사양 항목에서 id 키 제거(되돌림). pdf는 이 마이그가 안 건드렸으므로 그대로.
update public.equipment e
set specs = (
  select jsonb_agg(
    jsonb_set(
      grp,
      '{items}',
      (
        select coalesce(jsonb_agg(item - 'id'), '[]'::jsonb)
        from jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) item
      )
    )
  )
  from jsonb_array_elements(e.specs) grp
)
where jsonb_typeof(e.specs) = 'array' and jsonb_array_length(e.specs) > 0;
```

- [ ] **Step 4: 로컬 적용 확인**

Run: `supabase db reset`
Expected: 마이그레이션 전부 적용, 에러 없음.

검증(샘플 장비가 있으면 id가 채워졌는지):
Run: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "select jsonb_path_query_first(specs, '\$[0].items[0].id') from public.equipment limit 1;"`
Expected: uuid 또는 (장비 없으면) 빈 결과 — 에러 없으면 OK.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/<ts>_spec_item_ids.sql supabase/rollback/<ts>_spec_item_ids_down.sql
git commit -m "feat: 마이그레이션 — equipment.specs 항목 id backfill"
```

---

## Task 5: 마이그레이션 — quotes.spec_selection 컬럼

**Files:**
- Create: `supabase/migrations/<ts2>_quotes_spec_selection.sql`
- Create: `supabase/rollback/<ts2>_quotes_spec_selection_down.sql`

**Interfaces:**
- Produces: `quotes.spec_selection jsonb`(nullable, 기본 null). null = 구 견적 폴백, 배열 = 명시 선택.

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/<ts2>_quotes_spec_selection.sql`

```sql
-- 견적서 PDF 사양 선택 #2 — 견적별 PDF 사양 선택 저장.
-- null = 구 견적(이 기능 이전) → 워커가 pdf:true/전체 폴백. 배열 = 명시 선택(빈배열=0개).
alter table public.quotes
  add column spec_selection jsonb;
```

- [ ] **Step 2: 롤백 작성** — `supabase/rollback/<ts2>_quotes_spec_selection_down.sql`

```sql
alter table public.quotes
  drop column if exists spec_selection;
```

- [ ] **Step 3: 로컬 적용 확인**

Run: `supabase db reset`
Expected: 에러 없음. `quotes.spec_selection` 컬럼 존재.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/<ts2>_quotes_spec_selection.sql supabase/rollback/<ts2>_quotes_spec_selection_down.sql
git commit -m "feat: 마이그레이션 — quotes.spec_selection 컬럼"
```

---

## Task 6: create_quote/_manual_quote RPC에 spec_selection 인자

**Files:**
- Create: `supabase/migrations/<ts3>_quote_create_rpc_spec.sql`
- Create: `supabase/rollback/<ts3>_quote_create_rpc_spec_down.sql`

**Interfaces:**
- Consumes: `quotes.spec_selection`(Task 5)
- Produces: RPC 시그니처에 `p_spec_selection jsonb default null` 추가, `_quote_insert`가 그 값을 quotes에 저장.
  - `create_quote(p_application_id uuid, p_items jsonb, p_options jsonb, p_status text, p_spec_selection jsonb)`
  - `create_manual_quote(p_company, p_ceo, p_phone, p_email, p_items, p_options, p_status, p_spec_selection jsonb)`

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/<ts3>_quote_create_rpc_spec.sql`

기존 `20260607130000_quote_create_rpc.sql`의 `_quote_insert`·`create_quote`·`create_manual_quote`를 `create or replace`로 갱신(인자 추가). ⚠️ 인자 시그니처가 바뀌면 이전 시그니처 함수가 남으므로 먼저 drop.

```sql
-- 견적서 PDF 사양 선택 #3 — create RPC에 spec_selection 전달.
-- 기존 함수(인자 적은 시그니처)를 drop 후 재정의. _quote_insert도 인자 추가.

drop function if exists public.create_quote(uuid, jsonb, jsonb, text);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text);

-- 내부 insert 헬퍼 — spec_selection 인자 추가(null이면 그대로 null 저장 = 폴백).
create or replace function public._quote_insert(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text,
  p_spec_selection jsonb
)
returns public.quotes
language plpgsql
set search_path = ''
as $$
declare
  v_supply numeric(14, 2);
  v_tax numeric(14, 2);
  v_assignee uuid;
  v_row public.quotes;
begin
  perform public._quote_validate_lines(p_items);
  perform public._quote_validate_lines(p_options);

  -- spec_selection은 null(폴백) 또는 문자열 배열만 허용. 그 외(객체 등)는 거부.
  if p_spec_selection is not null and jsonb_typeof(p_spec_selection) is distinct from 'array' then
    raise exception 'spec_selection은 배열이어야 합니다';
  end if;

  v_supply := (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_items) e
  ) + (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_options) e
  );
  v_tax := round(v_supply * 0.1);

  select assignee_id into v_assignee from public.applications where id = p_application_id;

  insert into public.quotes (
    application_id, quote_no, version, items, options,
    supply_price, tax_price, total, status, assignee_id, spec_selection
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid()), p_spec_selection
  )
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public._quote_insert(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;

create or replace function public.create_quote(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.quotes;
begin
  if not public.has_permission(auth.uid(), 'quotes.write') then
    raise exception '견적 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.applications where id = p_application_id) then
    raise exception '존재하지 않는 의뢰입니다: %', p_application_id;
  end if;
  v_row := public._quote_insert(p_application_id, p_items, p_options, p_status, p_spec_selection);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.create_quote(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_quote(uuid, jsonb, jsonb, text, jsonb) to authenticated;

create or replace function public.create_manual_quote(
  p_company text,
  p_ceo text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_app_id uuid;
  v_row public.quotes;
begin
  if not public.has_permission(auth.uid(), 'quotes.write') then
    raise exception '견적 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;

  insert into public.applications (company, ceo, phone, email, source, status, assignee_id)
  values (
    v_company,
    nullif(btrim(coalesce(p_ceo, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    'manual', 'quoted', auth.uid()
  )
  returning id into v_app_id;

  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status, p_spec_selection);

  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb) to authenticated;
```

- [ ] **Step 2: 롤백 작성** — `supabase/rollback/<ts3>_quote_create_rpc_spec_down.sql`

```sql
-- 롤백 — spec_selection 인자 제거 버전으로 되돌림(원본 20260607130000 시그니처 복원).
drop function if exists public.create_quote(uuid, jsonb, jsonb, text, jsonb);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text, jsonb);
-- ⚠️ 원본 함수 복원은 20260607130000_quote_create_rpc.sql 재적용으로(이 down은 신규 시그니처만 제거).
```

- [ ] **Step 3: 로컬 적용 확인**

Run: `supabase db reset`
Expected: 에러 없음. 함수 재정의 성공.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/<ts3>_quote_create_rpc_spec.sql supabase/rollback/<ts3>_quote_create_rpc_spec_down.sql
git commit -m "feat: create RPC에 spec_selection 인자 — _quote_insert 저장"
```

---

## Task 7: 장비 폼 — 사양 항목 pdf 체크박스

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts:5-8` (specItemSchema)
- Modify: `apps/web/src/app/admin/equipment/_components/SpecEditor.tsx`
- Modify: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` (신규 항목 기본값)
- Test: `apps/web/src/app/admin/equipment/_components/SpecEditor` 동작은 E2E(Task 12)에서. 여기선 schema 단위 가능하면 추가.

**Interfaces:**
- Consumes: `SpecItem`(id·pdf, Task 1)
- Produces: 폼이 `specs[g].items[i].id`·`.pdf`를 보유·제출. 신규 항목 기본값 `{ id: "", label: "", value: "", pdf: true }`.

- [ ] **Step 1: specItemSchema 수정** — `apps/web/src/lib/equipment/schema.ts` 라인 5-8

```ts
// 사양 항목 — 빈 값 허용(편집 중 빈 행). 직렬화 시 제거·id 부여(serializeSpecs).
// id: 안정 고유표식(신규 항목은 빈 문자열, 저장 시 채움). pdf: 견적서 기본 포함.
export const specItemSchema = z.object({
  id: z.string().default(""),
  label: z.string(),
  value: z.string(),
  pdf: z.boolean().default(true),
});
```

⚠️ `pdf`를 `.default(true)`로 둬 신규 항목 기본 포함. 기존 항목 읽을 때 pdf 없으면 true로 채워지는데, 이는 **장비 폼 편집 화면 한정**(serializeSpecs는 boolean이면 보존, 폼 미저장 시 DB 원본 불변). 워커 폴백은 DB의 실제 pdf 유무로 판단하므로 영향 없음.

- [ ] **Step 2: SpecEditor 항목 행에 체크박스 추가** — `SpecEditor.tsx`

`SpecItems` 함수(라인 52-66)의 항목 행을 교체 — `register` 체크박스 추가:
```tsx
function SpecItems({ gIndex }: { gIndex: number }) {
  const { control, register } = useFormContext<FormInput>();
  const { fields, append, remove } = useFieldArray({ control, name: `specs.${gIndex}.items` as const });
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, iIndex) => (
        <div key={f.id} className="flex items-center gap-2">
          <label className="flex shrink-0 items-center gap-1 text-small text-muted" title="견적서 PDF에 기본 포함">
            <input type="checkbox" {...register(`specs.${gIndex}.items.${iIndex}.pdf`)} className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </label>
          <input {...register(`specs.${gIndex}.items.${iIndex}.label`)} placeholder="항목 (예: 속도)" className="w-40 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
          <input {...register(`specs.${gIndex}.items.${iIndex}.value`)} placeholder="값 (예: 1200매/h)" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 font-mono text-body text-text" />
          <button type="button" onClick={() => remove(iIndex)} className="text-small text-danger hover:underline">삭제</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ id: "", label: "", value: "", pdf: true })} className="self-start text-small font-medium text-accent hover:underline">+ 항목</button>
    </div>
  );
}
```

`SpecEditor`의 그룹 추가 버튼(라인 24)의 기본 항목도 갱신:
```tsx
onClick={() => append({ group: "", icon: "settings", items: [{ id: "", label: "", value: "", pdf: true }] })}
```

- [ ] **Step 3: EquipmentForm 기본값 확인·수정** — `EquipmentForm.tsx` 라인 58 근처

생성 시 specs 기본값을 신규 항목 형태로:
```tsx
specs: [{ group: "", icon: "settings", items: [{ id: "", label: "", value: "", pdf: true }] }],
```
(기존 `{ label:"", value:"" }`를 `{ id:"", label:"", value:"", pdf:true }`로)

- [ ] **Step 4: typecheck 통과 확인**

Run: `pnpm --filter web typecheck`
Expected: PASS (FormInput 타입에 id·pdf 반영됨)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/app/admin/equipment/_components/SpecEditor.tsx apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx
git commit -m "feat: 장비 폼 사양 항목에 PDF 포함 체크박스"
```

---

## Task 8: 워커 — id·pdf 보존 + spec_selection 조회·필터

**Files:**
- Modify: `apps/worker/src/jobs/quote-pdf.ts`

**Interfaces:**
- Consumes: `selectPdfSpecItems`(Task 2), `quotes.spec_selection`(Task 5), `equipment.specs`의 id·pdf
- Produces: 워커가 spec_selection 기준으로 거른 사양만 렌더(label/value만 quote-html로 전달 — quote-html은 불변).

- [ ] **Step 1: 견적 select에 spec_selection 추가** — `quote-pdf.ts` 라인 71-77

```ts
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_no, items, options, supply_price, issued_at, application_id, spec_selection, " +
        "assignee:assignee_id(name, phone), application:application_id(company, equipment_id)",
    )
    .eq("id", quoteId)
    .single();
```

- [ ] **Step 2: import 추가 + specGroups 변환에 id·pdf 보존 후 필터** — `quote-pdf.ts`

라인 2 import에 `selectPdfSpecItems` 추가:
```ts
import { formatKstKoreanDate, matchEquipmentName, numberToKoreanAmount, selectPdfSpecItems } from "@jhtechsaas/shared";
```

라인 131-139의 specGroups 변환을 교체 — id·pdf 보존 → 필터 → label/value만 추림:
```ts
  // specs(jsonb SpecGroup[]) → id·pdf 보존하여 정규화.
  const rawGroups = Array.isArray(equipment?.specs)
    ? (equipment.specs as { group?: string; icon?: string; items?: { id?: string; label?: string; value?: string; pdf?: boolean }[] }[])
        .map((g) => ({
          group: typeof g.group === "string" ? g.group : "",
          icon: "settings" as const, // 워커 렌더는 icon 미사용(형식 충족용)
          items: (g.items ?? []).map((i) => ({
            id: typeof i.id === "string" ? i.id : "",
            label: i.label ?? "",
            value: i.value ?? "",
            ...(typeof i.pdf === "boolean" ? { pdf: i.pdf } : {}),
          })),
        }))
        .filter((g) => g.items.length > 0)
    : [];

  // 견적 spec_selection(배열) 또는 null(폴백)으로 렌더 항목 선별.
  const specSelection = Array.isArray(q.spec_selection)
    ? (q.spec_selection as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  const specGroups = selectPdfSpecItems(rawGroups, specSelection).map((g) => ({
    group: g.group,
    items: g.items.map((i) => ({ label: i.label, value: i.value })),
  }));
```

⚠️ `q.spec_selection`이 `undefined`(구 데이터 select)면 `Array.isArray`가 false → null → 폴백. 정상.

- [ ] **Step 3: 워커 빌드·테스트 확인**

Run: `pnpm --filter @jhtechsaas/worker build` (없으면 `pnpm --filter worker build`)
Expected: PASS (타입 에러 없음)

Run: `pnpm --filter @jhtechsaas/worker test` (render-quote-pdf.test.ts 존재)
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/worker/src/jobs/quote-pdf.ts
git commit -m "feat: 워커 — spec_selection 기준 사양 필터(3단 폴백)"
```

---

## Task 9: 카탈로그에 사양(id·pdf) 로드

**Files:**
- Modify: `apps/web/src/lib/quotes/form.ts` (QuoteCatalogItem 타입)
- Modify: `apps/web/src/lib/quotes/equipment-match.server.ts` (specs 로드)
- Modify: `apps/web/src/app/admin/applications/[id]/quote/new/page.tsx` (catalog 매핑에 specs)
- Modify: `apps/web/src/app/admin/quotes/new/page.tsx` (동일 catalog 매핑이 있으면)

**Interfaces:**
- Consumes: `parseSpecs`(Task 1)
- Produces: `QuoteCatalogItem.specs: SpecGroup[]`(id·pdf 포함). 견적 폼이 메인 장비의 사양으로 선택 UI를 그린다.

- [ ] **Step 1: QuoteCatalogItem에 specs 추가** — `form.ts` 라인 10-17

```ts
import type { SpecGroup } from "@jhtechsaas/shared";

// 폼에 넘기는 카탈로그(클라 직렬화 안전). 서버 listEquipmentForMatch에서 가공.
export type QuoteCatalogItem = {
  id: string;
  name: string;
  model: string | null;
  basePrice: number;
  category: string | null;
  options: { kind: "included" | "extra"; name: string }[];
  specs: SpecGroup[]; // 견적서 사양 선택 UI용(id·pdf 포함)
};
```

- [ ] **Step 2: 서버 카탈로그에 specs 로드** — `equipment-match.server.ts`

`MatchableEquipmentWithOptions` 타입에 specs 추가 + select·매핑:
```ts
import { parseSpecs, type SpecGroup } from "@jhtechsaas/shared";

export type MatchableEquipmentWithOptions = MatchableEquipment & {
  options: EquipmentOption[];
  specs: SpecGroup[];
};
```

select(라인 13)에 `specs` 추가:
```ts
    .select("id, name, model, base_price, photos, specs, equipment_category:category_id(name), equipment_option(kind, name, price)")
```

매핑(라인 22-34 return)에 specs:
```ts
    return {
      id: row.id as string,
      name: row.name as string,
      model: (row.model as string | null) ?? null,
      category: cat?.name ?? null,
      photos: (row.photos as string[] | null) ?? [],
      basePrice: Number(row.base_price ?? 0),
      specs: parseSpecs(row.specs),
      options: opts.map((o) => ({
        kind: o.kind as "included" | "extra",
        name: o.name as string,
        price: String(o.price ?? "0"),
      })),
    };
```

- [ ] **Step 3: 페이지 catalog 매핑에 specs 전달** — `quote/new/page.tsx` 라인 52-55

```ts
  const catalog: QuoteCatalogItem[] = (await listEquipmentForMatch()).map((e) => ({
    id: e.id, name: e.name, model: e.model, basePrice: e.basePrice, category: e.category,
    options: e.options.map((o) => ({ kind: o.kind, name: o.name })),
    specs: e.specs,
  }));
```

`apps/web/src/app/admin/quotes/new/page.tsx`에 동일 매핑이 있으면 `specs: e.specs` 추가(없으면 스킵).

- [ ] **Step 4: typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (모든 QuoteCatalogItem 생성처가 specs 포함 — 누락 시 여기서 에러)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/quotes/form.ts apps/web/src/lib/quotes/equipment-match.server.ts apps/web/src/app/admin/applications/[id]/quote/new/page.tsx apps/web/src/app/admin/quotes/new/page.tsx
git commit -m "feat: 견적 카탈로그에 사양(id·pdf) 로드"
```

---

## Task 10: 견적 폼 사양 선택 헬퍼 (form.ts)

**Files:**
- Modify: `apps/web/src/lib/quotes/form.ts`
- Test: `apps/web/src/lib/quotes/form.test.ts`

**Interfaces:**
- Consumes: `defaultSpecSelection`·`specBudget`·`countSpecLines`·`selectPdfSpecItems`(shared), `ItemRow`·`QuoteCatalogItem`
- Produces:
  - `mainEquipmentSpecs(items: ItemRow[], catalog: QuoteCatalogItem[]): SpecGroup[]` — 첫 카탈로그 장비행의 사양(워커 items[0] 동작과 일치). 없으면 [].
  - `specSelectionBudget(items: ItemRow[], options: QuoteRow[], includedDeselected, catalog): { max: number; used: number; over: boolean }` — 현재 선택 기준 예산/사용/초과.

- [ ] **Step 1: 실패 테스트 작성** — `form.test.ts`에 추가

```ts
import { mainEquipmentSpecs, specSelectionBudget } from "./form";
import type { QuoteCatalogItem } from "./form";

const CAT: QuoteCatalogItem[] = [{
  id: "eq1", name: "프린터A", model: null, basePrice: 1000, category: null, options: [],
  specs: [{ group: "성능", icon: "gauge", items: [
    { id: "s1", label: "속도", value: "30", pdf: true },
    { id: "s2", label: "해상도", value: "1200", pdf: true },
  ] }],
}];

describe("mainEquipmentSpecs", () => {
  it("첫 카탈로그 장비행의 사양을 반환", () => {
    const items = [{ equipmentId: "eq1", name: "프린터A", unitPrice: 1000, quantity: 1 }];
    expect(mainEquipmentSpecs(items, CAT)[0]!.items.map((i) => i.id)).toEqual(["s1", "s2"]);
  });
  it("카탈로그 장비행 없으면 빈 배열", () => {
    const items = [{ equipmentId: "", name: "직접", unitPrice: 1000, quantity: 1 }];
    expect(mainEquipmentSpecs(items, CAT)).toEqual([]);
  });
});

describe("specSelectionBudget", () => {
  it("max·used·over를 계산", () => {
    const items = [{ equipmentId: "eq1", name: "프린터A", unitPrice: 1000, quantity: 1 }];
    const r = specSelectionBudget(items, [], [], CAT, ["s1", "s2"]);
    expect(r.max).toBeGreaterThan(0);
    expect(r.used).toBe(2); // 그룹1(제목1) + 항목2(2열 1줄) = 2
    expect(typeof r.over).toBe("boolean");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test form`
Expected: FAIL (함수 없음)

- [ ] **Step 3: form.ts에 헬퍼 추가**

import에 추가:
```ts
import { defaultSpecSelection, selectPdfSpecItems, specBudget, countSpecLines, type SpecGroup } from "@jhtechsaas/shared";
```

함수 추가(파일 끝):
```ts
// 견적 메인 장비(첫 카탈로그 장비행)의 사양 — 워커의 items[0] 기준과 일치. 직접입력만이면 [].
export function mainEquipmentSpecs(items: ItemRow[], catalog: QuoteCatalogItem[]): SpecGroup[] {
  for (const it of items) {
    if (!it.equipmentId) continue;
    const eq = catalog.find((c) => c.id === it.equipmentId);
    if (eq) return eq.specs;
  }
  return [];
}

// 사양 선택 예산 — 현재 품목·옵션 기준 max 줄, 선택(specSelection)이 차지하는 used 줄, 초과 여부.
export function specSelectionBudget(
  items: ItemRow[],
  options: QuoteRow[],
  includedDeselected: string[],
  catalog: QuoteCatalogItem[],
  specSelection: string[],
): { max: number; used: number; over: boolean } {
  const includedCount = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n)).length;
  const extraCount = cleanRows(options).length;
  const itemCount = items.filter((i) => i.name.trim() !== "" || i.equipmentId).length;
  const max = specBudget({ itemCount, includedCount, extraCount });
  const selectedGroups = selectPdfSpecItems(mainEquipmentSpecs(items, catalog), specSelection);
  const used = countSpecLines(selectedGroups);
  return { max, used, over: used > max };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test form`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/quotes/form.ts apps/web/src/lib/quotes/form.test.ts
git commit -m "feat: 견적 폼 사양 선택 헬퍼 — mainEquipmentSpecs·specSelectionBudget"
```

---

## Task 11: SpecSelectionEditor + 폼 결선 + 액션/스키마 + 재발행 프리필

**Files:**
- Create: `apps/web/src/app/admin/_components/SpecSelectionEditor.tsx`
- Modify: `apps/web/src/lib/quotes/schema.ts` (spec_selection)
- Modify: `apps/web/src/lib/quotes/actions.ts` (RPC에 p_spec_selection)
- Modify: `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx`
- Modify: `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx`
- Modify: `apps/web/src/app/admin/applications/[id]/quote/new/page.tsx` (재발행 프리필)

**Interfaces:**
- Consumes: `mainEquipmentSpecs`·`specSelectionBudget`·`defaultSpecSelection`(Task 10·2), `createQuoteAction`·`createManualQuoteAction`
- Produces: 폼이 `specSelection: string[]` 상태를 관리하고 액션에 `specSelection` 전달. 재발행 시 `initialSpecSelection` 프리필.

- [ ] **Step 1: createQuotePayloadSchema에 spec_selection 추가** — `schema.ts`

```ts
export const createQuotePayloadSchema = z.object({
  items: QuoteInputSchema.shape.items.min(1, "장비를 최소 한 줄 입력하세요"),
  options: QuoteInputSchema.shape.options,
  status: z.enum(["draft", "issued"]),
  // 견적서 PDF에 넣을 사양 항목 id 목록(빈배열=0개). 미지정 시 빈배열로 저장.
  specSelection: z.array(z.string()).default([]),
});
```

- [ ] **Step 2: actions.ts RPC 호출에 p_spec_selection 전달** — `createQuoteAction`·`createManualQuoteAction`

`createQuoteAction`의 rpc 호출(라인 129-134):
```ts
  const { error } = await supabase.rpc("create_quote", {
    p_application_id: applicationId,
    p_items: v.items,
    p_options: v.options,
    p_status: v.status,
    p_spec_selection: v.specSelection,
  });
```

`createManualQuoteAction`의 rpc 호출(라인 157-165):
```ts
  const { data, error } = await supabase.rpc("create_manual_quote", {
    p_company: v.company,
    p_ceo: v.ceo ?? null,
    p_phone: v.phone ?? null,
    p_email: v.email ?? null,
    p_items: v.items,
    p_options: v.options,
    p_status: v.status,
    p_spec_selection: v.specSelection,
  });
```

- [ ] **Step 3: SpecSelectionEditor 컴포넌트 작성** — `SpecSelectionEditor.tsx`

```tsx
"use client";
import { selectPdfSpecItems, type SpecGroup } from "@jhtechsaas/shared";

// 견적서 사양 선택 — 항목별 체크박스 + 한 페이지 하드캡(예산 초과 시 미선택 비활성).
// QuoteForm·ManualQuoteForm 공유. 메인 장비 사양이 없으면(직접입력만) 렌더 안 함.
export function SpecSelectionEditor({
  specs,
  selected,
  setSelected,
  max,
  disabled,
}: {
  specs: SpecGroup[];
  selected: string[];
  setSelected: (next: string[]) => void;
  max: number; // 사양에 쓸 수 있는 최대 줄 수
  disabled?: boolean;
}) {
  if (specs.length === 0) return null;

  // 현재 선택이 차지하는 줄 수.
  const usedGroups = selectPdfSpecItems(specs, selected);
  const used = usedGroups.reduce((acc, g) => (g.items.length ? acc + 1 + Math.ceil(g.items.length / 2) : acc), 0);
  const full = used >= max;

  function toggle(id: string, checked: boolean) {
    if (checked) setSelected([...selected, id]);
    else setSelected(selected.filter((x) => x !== id));
  }

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-h2 font-medium text-text">견적서 사양 선택</h2>
        <span className={`text-small ${used > max ? "text-danger" : "text-muted"}`}>
          한 페이지 예산: {used}/{max}줄
        </span>
      </div>
      {used > max && (
        <p className="mb-2 text-small text-danger">사양이 한 페이지를 넘칩니다. 일부 항목을 해제하세요.</p>
      )}
      <div className="flex flex-col gap-3">
        {specs.map((g) => (
          <div key={g.group} className="flex flex-col gap-1">
            {g.group && <div className="text-small font-semibold text-text">{g.group}</div>}
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {g.items.map((i) => {
                const checked = selected.includes(i.id);
                // 하드캡: 미선택 항목은 예산이 다 차면 비활성(이미 선택된 것은 항상 해제 가능).
                const blocked = !checked && full;
                return (
                  <label key={i.id} className={`flex items-center gap-2 text-body ${blocked ? "opacity-40" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || blocked}
                      onChange={(e) => toggle(i.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-muted">{i.label}</span>
                    <span className="font-mono text-text">{i.value}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: QuoteForm 결선** — `QuoteForm.tsx`

import 추가:
```ts
import { mainEquipmentSpecs, specSelectionBudget } from "@/lib/quotes/form";
import { defaultSpecSelection } from "@jhtechsaas/shared";
import { SpecSelectionEditor } from "@/app/admin/_components/SpecSelectionEditor";
```

props에 `initialSpecSelection?: string[]` 추가. 상태·기본값:
```ts
  const [specSelection, setSpecSelection] = useState<string[]>(
    () => initialSpecSelection ?? defaultSpecSelection(mainEquipmentSpecs(toItemRows(initialItems, catalog), catalog)),
  );
```

⚠️ 장비를 바꾸면(items 변경) 사양도 바뀌므로, 메인 장비 id가 바뀔 때 selection을 재기본화해야 한다. `items`의 첫 장비 id를 추적:
```ts
  const mainEqId = items.find((i) => i.equipmentId)?.equipmentId ?? "";
  const prevEqRef = useRef(mainEqId);
  useEffect(() => {
    if (prevEqRef.current !== mainEqId) {
      prevEqRef.current = mainEqId;
      setSpecSelection(defaultSpecSelection(mainEquipmentSpecs(items, catalog)));
    }
  }, [mainEqId, items, catalog]);
```
(`useRef`·`useEffect` import 추가)

submit에 specSelection 전달:
```ts
      const res = await createQuoteAction(applicationId, { items: cItems, options: cOptions, status, specSelection });
```

JSX — QuoteLinesEditor 아래에 SpecSelectionEditor 삽입(라인 95 `</div>` 직전, QuoteLinesEditor 다음):
```tsx
        <SpecSelectionEditor
          specs={mainEquipmentSpecs(items, catalog)}
          selected={specSelection}
          setSelected={setSpecSelection}
          max={specSelectionBudget(items, options, includedDeselected, catalog, specSelection).max}
          disabled={pending}
        />
```

- [ ] **Step 5: ManualQuoteForm 결선** — `ManualQuoteForm.tsx`

동일 import. 상태:
```ts
  const [specSelection, setSpecSelection] = useState<string[]>([]);
  const mainEqId = items.find((i) => i.equipmentId)?.equipmentId ?? "";
  const prevEqRef = useRef(mainEqId);
  useEffect(() => {
    if (prevEqRef.current !== mainEqId) {
      prevEqRef.current = mainEqId;
      setSpecSelection(defaultSpecSelection(mainEquipmentSpecs(items, catalog)));
    }
  }, [mainEqId, items, catalog]);
```

submit의 createManualQuoteAction 호출에 `specSelection` 추가:
```ts
      const res = await createManualQuoteAction({ company, ceo, phone, email, items: pItems, options: pOptions, status, specSelection });
```

JSX — QuoteLinesEditor 아래에 SpecSelectionEditor 삽입(동일 형태).

- [ ] **Step 6: 재발행 프리필** — `quote/new/page.tsx`

`getQuote`가 spec_selection을 반환하는지 확인 후, 프리필:
```ts
  let initialSpecSelection: string[] | undefined;
  if (from) {
    const src = await getQuote(from);
    if (src && src.application_id === id) {
      initialItems = parseQuoteLines(src.items);
      initialOptions = parseQuoteLines(src.options);
      initialSpecSelection = Array.isArray(src.spec_selection)
        ? src.spec_selection.filter((x): x is string => typeof x === "string")
        : undefined;
    }
  }
```
⚠️ `getQuote`(`@/lib/quotes/queries`)의 select에 `spec_selection`이 없으면 추가. `grep -n "spec_selection\|select" apps/web/src/lib/quotes/queries.ts`로 확인 후 select 문자열에 `spec_selection` 추가.

QuoteForm에 prop 전달:
```tsx
      <QuoteForm
        applicationId={id}
        catalog={catalog}
        initialItems={initialItems}
        initialOptions={initialOptions}
        initialSpecSelection={initialSpecSelection}
        contextSlot={<ApplicationContext id={id} />}
      />
```

- [ ] **Step 7: typecheck·lint·단위테스트**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/app/admin/_components/SpecSelectionEditor.tsx apps/web/src/lib/quotes/schema.ts apps/web/src/lib/quotes/actions.ts apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx apps/web/src/app/admin/applications/[id]/quote/new/page.tsx apps/web/src/lib/quotes/queries.ts
git commit -m "feat: 견적 폼 사양 선택 섹션 + 하드캡 + 재발행 프리필"
```

---

## Task 12: 시각 검증 + E2E + 전체 게이트

**Files:**
- Modify: `apps/worker/src/jobs/_render-sample.ts` (사양 多 샘플 + spec_selection)
- Create: `apps/web/e2e/<name>.spec.ts` (사양 선택 E2E) — 기존 견적 e2e 패턴 따름

**Interfaces:**
- Consumes: 전체 기능

- [ ] **Step 1: 워커 시각 샘플에 spec_selection 케이스 추가** — `_render-sample.ts`

기존 하니스 구조를 확인(`Read apps/worker/src/jobs/_render-sample.ts`) 후, 사양이 많은(10+ 항목) 장비 + `spec_selection`을 일부만 준 케이스와 전체(null 폴백) 케이스 2종을 렌더하도록 추가.

Run: `cd apps/worker && pnpm tsx src/jobs/_render-sample.ts` (env는 CLAUDE.md대로 명시 주입)
Expected: PDF 파일 생성.

- [ ] **Step 2: PDF를 Read 도구로 대조**

생성된 PDF를 **Read 도구**로 열어 (PNG/PDF cat/grep 금지) 사양 선택분만 나오고 한 페이지를 유지하는지 확인.

- [ ] **Step 3: E2E 작성** — 기존 견적 E2E 패턴(`apps/web/e2e/`)을 보고 따름

시나리오: admin 로그인 → 장비 사양 항목 일부 PDF 체크 해제 저장 → 견적 작성 화면에서 "견적서 사양 선택" 섹션 노출 확인 → 체크박스 토글 → 발행 → (가능하면) spec_selection 저장 확인.

Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e <name>`
Expected: PASS

- [ ] **Step 4: 전체 게이트 실행**

```bash
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e
grep -rn "as any" apps/web/src apps/worker/src packages/shared/src || echo "as any 0개"
```
Expected: 전부 GREEN, `as any` 0개.

- [ ] **Step 5: 커밋**

```bash
git add apps/worker/src/jobs/_render-sample.ts apps/web/e2e/
git commit -m "test: 견적 사양 선택 시각검증 샘플 + E2E"
```

---

## 배포 (게이트 통과 후)

- `/ship`으로 PR 생성·머지(main 직접 푸시 금지).
- 머지 후 `supabase db push`(prod ref `okxmeqrvtlvmxfltsara`) — 3 마이그레이션 적용.
- prod 배포 후 견적 작성 화면 200 + 사양 선택 노출 확인.
- 로드맵: `docs/roadmap.json` 해당 phase status 갱신 후 `pnpm roadmap:sync`.

---

## Self-Review

- **Spec coverage**: 데이터 모델(§1)→Task 1·2·4·5·6 / 장비 폼(§2.1)→Task 7 / 워커(§2.2)→Task 8 / 견적 폼·하드캡(§3)→Task 9·10·11 / 테스트·마이그·게이트(§4)→Task 4·5·6·12. 모두 매핑됨.
- **null vs []**: 핵심 설계 정밀화 섹션 + Task 2 테스트에서 명시. defaultSpecSelection이 미설정 장비를 전체 id로 처리 → "render nothing" 함정 회피.
- **Type consistency**: `selectPdfSpecItems`/`defaultSpecSelection`/`specBudget`/`countSpecLines`/`mainEquipmentSpecs`/`specSelectionBudget` 시그니처가 정의 Task와 사용 Task에서 일치. RPC `p_spec_selection jsonb` ↔ 액션 `specSelection: string[]` 일치.
- **장비 변경 시 재기본화**: Task 11에 useEffect로 메인 장비 id 변경 감지 → selection 재기본화 포함(놓치기 쉬운 부분).
- **불확실 지점(구현 시 확인)**: ① `getQuote` select에 spec_selection 유무(Task 11 Step6에서 grep) ② 워커 필터 패키지명(`@jhtechsaas/worker` vs `worker`) ③ `_render-sample.ts` 기존 구조 ④ specBudget 상수는 실제 PDF 대조로 튜닝(Task 12 Step2).
