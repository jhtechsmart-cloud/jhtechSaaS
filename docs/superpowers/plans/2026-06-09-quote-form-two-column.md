# 견적 작성 페이지 2단 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 작성 페이지(의뢰 기반·수기)를 "넓은 왼쪽 + 좁은 sticky 오른쪽" 2단으로 바꿔, 왼쪽에 맥락·입력 폼을, 오른쪽 고정 칸에 실시간 합계를 둔다.

**Architecture:** 실시간 합계 계산을 `QuoteLinesEditor` 내부에서 폼 순수 헬퍼(`formPreviewTotals`)로 끌어올리고, 공용 sticky 합계 패널(`QuoteTotalsAside`)을 만들어 두 폼이 공유한다. 의뢰 기반 폼은 서버에서 렌더한 맥락 블록(신청기업·설문·사진)을 `contextSlot`(ReactNode)으로 주입받는다. DB·RPC·저장 흐름은 불변.

**Tech Stack:** Next.js(App Router, RSC) · React client components · Tailwind · Vitest(node, 순수 로직) · Playwright(E2E, 레이아웃 검증).

---

## File Structure

| 파일 | 역할 | 종류 |
|---|---|---|
| `apps/web/src/lib/quotes/form.ts` | `formPreviewTotals` 헬퍼 추가 | 수정 |
| `apps/web/src/lib/quotes/form.test.ts` | `formPreviewTotals` 단위 테스트 | 수정 |
| `apps/web/src/app/admin/_components/QuoteTotalsAside.tsx` | 공용 sticky 합계 패널(+버튼 슬롯) | 생성 |
| `apps/web/src/app/admin/_components/QuoteLinesEditor.tsx` | 내부 실시간 합계 블록 제거 | 수정 |
| `apps/web/src/app/admin/applications/[id]/_components/ApplicationContext.tsx` | 맥락 블록(신청기업·설문·사진) 서버 컴포넌트 | 생성 |
| `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx` | 2단 그리드 + contextSlot + 합계 패널 | 수정 |
| `apps/web/src/app/admin/applications/[id]/quote/new/page.tsx` | ApplicationContext 렌더·주입, 컨테이너 폭 확장 | 수정 |
| `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx` | 2단 그리드 + 합계 패널(맥락 없음) | 수정 |
| `apps/web/src/app/admin/quotes/new/page.tsx` | 컨테이너 폭 확장 | 수정 |

**설계 결정 — 의뢰 상세 페이지는 건드리지 않는다:** 맥락 블록 3종(`ApplicantInfo`·`InstallSurvey`·`SitePhotos`)의 **UI 컴포넌트**는 재활용하되, 로드·가공 로직은 `ApplicationContext`에 새로 둔다. 잘 동작하는 상세 페이지(`[id]/page.tsx`)를 리팩터링하면 회귀 위험이 크고, 사용자 규칙(최소 변경·요청하지 않은 리팩터링 금지)에 어긋난다. 가공 로직이 상세 페이지와 일부 겹치지만, 새 표면을 깔끔히 유지하는 의도된 트레이드오프다(제3의 소비처가 생기면 그때 공용 추출).

---

### Task 1: `formPreviewTotals` 순수 헬퍼 추출 (TDD)

폼 상태(장비행·추가옵션·해제된 포함옵션)에서 실시간 합계를 계산하는 로직은 현재 `QuoteLinesEditor` 안에 인라인이다. 합계를 폼 밖(오른쪽 패널)으로 옮기려면 이 계산을 폼이 직접 해야 하므로, 순수 헬퍼로 추출해 두 폼이 공유한다.

**Files:**
- Modify: `apps/web/src/lib/quotes/form.ts`
- Test: `apps/web/src/lib/quotes/form.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/quotes/form.test.ts` 끝에 추가 (기존 import 블록에 `formPreviewTotals`를 추가하고, 아래 describe를 파일 끝에 붙인다):

```ts
import { formPreviewTotals, type QuoteCatalogItem, type ItemRow, type QuoteRow } from "./form";

describe("formPreviewTotals", () => {
  const catalog: QuoteCatalogItem[] = [
    {
      id: "eq1",
      name: "UV3300S",
      model: "M1",
      basePrice: 50_000_000,
      category: "프린터",
      options: [
        { kind: "included", name: "기본설치" },
        { kind: "included", name: "원격지원" },
      ],
    },
  ];

  it("장비 + 추가옵션 합계(공급가·세액10%·합계) 계산", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
    const extra: QuoteRow[] = [{ name: "프린트헤드", unitPrice: 2_500_000, quantity: 2 }];
    // 포함옵션(단가 0)은 합계에 영향 없음 → 공급가 = 50,000,000 + 5,000,000 = 55,000,000
    const r = formPreviewTotals(items, extra, [], catalog);
    expect(r.supplyPrice).toBe(55_000_000);
    expect(r.taxPrice).toBe(5_500_000);
    expect(r.total).toBe(60_500_000);
  });

  it("포함옵션 해제는 합계에 영향 없음(단가 0)", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
    const all = formPreviewTotals(items, [], [], catalog);
    const someDeselected = formPreviewTotals(items, [], ["원격지원"], catalog);
    expect(someDeselected.total).toBe(all.total);
  });

  it("빈/NaN 입력은 0으로 처리(공급가 0)", () => {
    const items: ItemRow[] = [{ equipmentId: "", name: "", unitPrice: Number.NaN, quantity: Number.NaN }];
    const r = formPreviewTotals(items, [], [], catalog);
    expect(r.supplyPrice).toBe(0);
    expect(r.total).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/web test -- form.test.ts`
Expected: FAIL — `formPreviewTotals is not a function` (또는 export 없음).

- [ ] **Step 3: 헬퍼 구현**

`apps/web/src/lib/quotes/form.ts`의 `previewTotals` 함수 **바로 아래**에 추가:

```ts
// 폼 상태(장비행·추가옵션·해제된 포함옵션)에서 실시간 합계 계산.
// QuoteLinesEditor에 인라인이던 계산을 폼 상단으로 끌어올려 합계 패널과 공유한다.
export function formPreviewTotals(
  items: ItemRow[],
  options: QuoteRow[],
  includedDeselected: string[],
  catalog: QuoteCatalogItem[],
): QuoteResult {
  const checkedIncluded = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n));
  return previewTotals(itemRowsToLines(items), buildQuoteOptions(checkedIncluded, options));
}
```

`form.ts` 상단 import에 `QuoteResult`가 이미 있는지 확인 — 1줄에 `import { calculateQuote, type QuoteInput, type QuoteResult } from "@jhtechsaas/shared";`로 이미 존재하므로 추가 import 불필요.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/web test -- form.test.ts`
Expected: PASS (기존 form 테스트 전부 + 신규 3건).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/quotes/form.ts apps/web/src/lib/quotes/form.test.ts
git commit -m "feat: 견적 폼 실시간 합계 순수 헬퍼 formPreviewTotals 추출"
```

---

### Task 2: 공용 sticky 합계 패널 `QuoteTotalsAside` 생성

오른쪽 고정 칸에 들어갈 합계 카드. `QuoteResult`를 받아 공급가·세액·합계를 표시하고, 저장·발행 버튼(과 에러 메시지)은 `children`으로 받는다. 두 폼이 공유한다. (이 단계에서는 아직 어느 폼도 사용하지 않는 추가-only.)

**Files:**
- Create: `apps/web/src/app/admin/_components/QuoteTotalsAside.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";
import type { ReactNode } from "react";
import type { QuoteResult } from "@jhtechsaas/shared";

// 견적 작성 오른쪽 sticky 합계 패널 — 공급가·세액·합계 + 버튼 슬롯(children).
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 좁은 화면(lg 미만)에선 sticky 해제.
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function QuoteTotalsAside({ totals, children }: { totals: QuoteResult; children?: ReactNode }) {
  return (
    <div className="self-start lg:sticky lg:top-0">
      <div className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-h2 font-medium text-text">실시간 합계</h2>
        <TotalRow label="공급가" value={totals.supplyPrice} />
        <TotalRow label="세액 (10%)" value={totals.taxPrice} />
        <div className="my-2 border-t border-border" />
        <TotalRow label="합계" value={totals.total} strong />
        {children && <div className="mt-4 flex flex-col gap-2">{children}</div>}
      </div>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-body ${strong ? "font-semibold text-text" : "text-muted"}`}>{label}</span>
      <span className={`font-mono tabular-nums ${strong ? "text-h2 font-semibold text-text" : "text-body text-text"}`}>{won(value)}</span>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS (QuoteResult 필드 supplyPrice·taxPrice·total 존재).

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/_components/QuoteTotalsAside.tsx
git commit -m "feat: 공용 sticky 합계 패널 QuoteTotalsAside 추가"
```

---

### Task 3: 맥락 블록 서버 컴포넌트 `ApplicationContext` 생성

의뢰 id로 신청 레코드를 로드해 신청기업·설치설문·현장사진 블록을 렌더하는 서버 컴포넌트. 상세 페이지의 블록 UI 컴포넌트를 재활용한다. (추가-only, 이 단계에선 미사용.)

**Files:**
- Create: `apps/web/src/app/admin/applications/[id]/_components/ApplicationContext.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { formatBizNo, formatPhone } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { ApplicantInfo } from "./quote-frame/ApplicantInfo";
import { InstallSurvey } from "./quote-frame/InstallSurvey";
import { SitePhotos } from "./quote-frame/SitePhotos";

const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 진입로",
  ext_building: "외부 건물",
  int_entrance: "내부 입구",
  int_location: "설치 위치",
};

// 견적 작성 화면 좌측 맥락 — 신청기업·설치설문·현장사진.
// 의뢰 상세 페이지의 블록 컴포넌트를 재활용. id로 로드·가공해 서버 렌더.
export async function ApplicationContext({ id }: { id: string }) {
  const r = (await getApplicationForAdmin(id)) as Record<string, unknown> | null;
  if (!r) return null;

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const companyId = r.company_id as string | null;
  const fields = (r.fields ?? {}) as {
    requirements?: string;
    equipment_name?: string;
    install_survey?: Record<string, string | string[]>;
    photos?: Partial<Record<PhotoSlot, string>>;
  };
  const survey = fields.install_survey ?? {};

  // 신청기업 기본 항목(접수 시 자동 수집분만) — 상세 페이지와 동일 구성.
  const basic: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "회사명", value: str(r.company) },
    { label: "사업자번호", value: formatBizNo(str(r.biz_no) ?? "") || null, mono: true },
    { label: "대표자", value: str(r.ceo) },
    { label: "연락처", value: formatPhone(str(r.phone) ?? "") || null, mono: true },
    { label: "이메일", value: str(r.email) },
    { label: "사업장주소", value: str(r.address) },
    { label: "접수번호", value: str(r.seq_no), mono: true },
  ];

  // 설문 rows — InstallSurvey가 받는 형태로 가공.
  const handlingArr = Array.isArray(survey.handling) ? (survey.handling as string[]) : [];
  const handlingText = handlingArr
    .map((h) => (SURVEY_LABELS.handling as Record<string, string>)[h] ?? h)
    .join(", ");
  const surveyRows: { label: string; value: string }[] = [
    ...(["building_type", "location", "elevator", "power", "pneumatic"] as const).map((k) => {
      const raw = survey[k];
      const v = typeof raw === "string" ? raw : "";
      const label = (SURVEY_LABELS[k] as Record<string, string>)[v] ?? (v || "-");
      return { label: SURVEY_FIELD_LABELS[k], value: label };
    }),
    { label: SURVEY_FIELD_LABELS.handling, value: handlingText || "-" },
  ];
  const surveyExtra = typeof survey.extra === "string" && survey.extra ? survey.extra : null;

  // 현장 사진 — 4슬롯 서명URL(경로 정규식 강제: RPC 우회 임의경로 차단).
  const supabase = await createSupabaseServerClient();
  const photos = fields.photos ?? {};
  const signed = await Promise.all(
    PHOTO_SLOTS.map(async (slot) => {
      const path = photos[slot];
      const pathRe = new RegExp(`^[0-9a-f-]{36}/${slot}\\.(jpe?g|png|webp)$`, "i");
      if (!path || !pathRe.test(path)) return { slot, url: null as string | null };
      const { data } = await supabase.storage.from("customer-uploads").createSignedUrl(path, 600);
      return { slot, url: data?.signedUrl ?? null };
    }),
  );
  const sitePhotos = signed
    .filter((s): s is { slot: PhotoSlot; url: string } => s.url !== null)
    .map((s) => ({ slot: s.slot, label: PHOTO_SLOT_LABELS[s.slot], url: s.url }));

  return (
    <>
      <ApplicantInfo
        companyId={companyId}
        basic={basic}
        requirements={fields.requirements ?? null}
        equipmentName={fields.equipment_name ?? null}
      />
      <InstallSurvey rows={surveyRows} extra={surveyExtra} />
      <SitePhotos photos={sitePhotos} />
    </>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS. (실패 시: `getApplicationForAdmin` 경로/시그니처, `SURVEY_LABELS`/`SURVEY_FIELD_LABELS`/`PHOTO_SLOTS` export를 `lib/applications/schema`에서 재확인 — 상세 페이지 `[id]/page.tsx`가 동일 import를 쓴다.)

- [ ] **Step 3: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/_components/ApplicationContext.tsx"
git commit -m "feat: 견적 작성 맥락 블록 서버 컴포넌트 ApplicationContext 추가"
```

---

### Task 4: `QuoteForm` 2단 그리드 + contextSlot + 합계 패널

의뢰 기반 폼을 2단으로. 왼쪽 = `{contextSlot}` + `QuoteLinesEditor`, 오른쪽 = `QuoteTotalsAside`(저장·발행 버튼·에러를 children으로). 합계는 `formPreviewTotals`로 직접 계산.

> ⚠️ 이 시점에서 `QuoteLinesEditor`는 아직 내부 합계를 렌더한다 → 화면에 합계가 잠깐 두 번 보인다(임시). Task 7에서 에디터 합계를 제거해 단일화한다. E2E는 최종 게이트(Task 8)에서만 돌리므로 중간 상태는 무해.

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx`

- [ ] **Step 1: import 교체**

상단 import 블록에서 `availableIncludedNames`, `buildQuoteOptions`, `itemRowsToLines`, `rowsToQuoteInput`, `validateQuoteForm`은 유지하고 `formPreviewTotals`를 추가, 그리고 새 컴포넌트 2개를 import. `ReactNode` 타입도 추가.

기존:
```tsx
import { useState, useTransition } from "react";
```
교체:
```tsx
import { useState, useTransition, type ReactNode } from "react";
```

기존 `form` import 블록에 `formPreviewTotals` 추가:
```tsx
import {
  availableIncludedNames,
  buildQuoteOptions,
  formPreviewTotals,
  itemRowsToLines,
  rowsToQuoteInput,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
```

`QuoteLinesEditor` import 아래에 추가:
```tsx
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
```

- [ ] **Step 2: props에 contextSlot 추가**

함수 시그니처의 props 타입에 `contextSlot` 추가:
```tsx
export function QuoteForm({
  applicationId,
  catalog,
  initialItems,
  initialOptions,
  contextSlot,
}: {
  applicationId: string;
  catalog: QuoteCatalogItem[];
  initialItems?: QuoteRow[];
  initialOptions?: QuoteRow[];
  contextSlot?: ReactNode;
}) {
```

- [ ] **Step 3: return JSX를 2단 그리드로 교체**

기존 `return ( <div className="flex flex-col gap-6"> ... </div> );` 전체를 아래로 교체. (submit 함수·상태 선언부는 그대로 둔다. `submit` 함수 위에서 합계 계산을 추가.)

`submit` 함수 정의 바로 위(또는 아래)에 합계 계산 추가:
```tsx
  const totals = formPreviewTotals(items, options, includedDeselected, catalog);
```

return:
```tsx
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        {contextSlot}
        <QuoteLinesEditor
          catalog={catalog}
          items={items}
          setItems={setItems}
          includedDeselected={includedDeselected}
          setIncludedDeselected={setIncludedDeselected}
          options={options}
          setOptions={setOptions}
          disabled={pending}
        />
      </div>
      <QuoteTotalsAside totals={totals}>
        {error && <p className="text-small text-danger">{error}</p>}
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
    </div>
  );
```

- [ ] **Step 4: 타입 체크 + 빌드**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/_components/QuoteForm.tsx"
git commit -m "feat: 견적 작성 폼 2단 그리드 + 맥락 슬롯 + 합계 패널"
```

---

### Task 5: 의뢰 견적 페이지 `quote/new/page.tsx` 배선

`ApplicationContext`를 렌더해 `QuoteForm`에 `contextSlot`으로 주입하고, 컨테이너 폭을 2단이 가능하도록 넓힌다.

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/quote/new/page.tsx`

- [ ] **Step 1: import 추가**

`QuoteForm` import 아래에 추가:
```tsx
import { ApplicationContext } from "../../_components/ApplicationContext";
```

- [ ] **Step 2: 컨테이너 폭 확장 + QuoteForm에 contextSlot 주입**

기존 return의 `<section className="flex max-w-3xl flex-col gap-4">`에서 `max-w-3xl`를 제거(2단 폭 확보):
```tsx
    <section className="flex flex-col gap-4">
```

기존 `<QuoteForm applicationId={id} catalog={catalog} initialItems={initialItems} initialOptions={initialOptions} />`를 교체:
```tsx
      <QuoteForm
        applicationId={id}
        catalog={catalog}
        initialItems={initialItems}
        initialOptions={initialOptions}
        contextSlot={<ApplicationContext id={id} />}
      />
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/quote/new/page.tsx"
git commit -m "feat: 견적 작성 페이지에 맥락 블록 주입 + 컨테이너 폭 확장"
```

---

### Task 6: `ManualQuoteForm` 2단 그리드 + 합계 패널

수기 폼을 2단으로. 왼쪽 = 고객 입력 섹션 + `QuoteLinesEditor`, 오른쪽 = `QuoteTotalsAside`(맥락 없음). 합계는 `formPreviewTotals`로 계산.

**Files:**
- Modify: `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx`

- [ ] **Step 1: import 추가**

기존 `form` import 블록에 `formPreviewTotals` 추가:
```tsx
import {
  availableIncludedNames,
  buildQuoteOptions,
  formPreviewTotals,
  itemRowsToLines,
  rowsToQuoteInput,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
```

`QuoteLinesEditor` import 아래에 추가:
```tsx
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
```

- [ ] **Step 2: 합계 계산 추가**

`submit` 함수 위에 추가:
```tsx
  const totals = formPreviewTotals(items, options, includedDeselected, catalog);
```

- [ ] **Step 3: return JSX를 2단 그리드로 교체**

기존 `return ( <div className="flex flex-col gap-6"> ... </div> );` 전체를 교체:
```tsx
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-2 text-h2 font-medium text-text">고객</h2>
          <div className="flex flex-col gap-2">
            <Field label="회사명" value={company} onChange={setCompany} disabled={pending} required />
            <Field label="대표자" value={ceo} onChange={setCeo} disabled={pending} />
            <Field label="연락처" value={phone} onChange={setPhone} disabled={pending} />
            <Field label="이메일" value={email} onChange={setEmail} disabled={pending} />
          </div>
        </section>

        <QuoteLinesEditor
          catalog={catalog}
          items={items}
          setItems={setItems}
          includedDeselected={includedDeselected}
          setIncludedDeselected={setIncludedDeselected}
          options={options}
          setOptions={setOptions}
          disabled={pending}
        />
      </div>

      <QuoteTotalsAside totals={totals}>
        {error && <p className="text-small text-danger">{error}</p>}
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
    </div>
  );
```

(`Field` 헬퍼 함수는 파일 하단에 그대로 둔다.)

- [ ] **Step 4: 컨테이너 폭 확장 — `quotes/new/page.tsx`**

`apps/web/src/app/admin/quotes/new/page.tsx`의 `<section className="flex max-w-3xl flex-col gap-4">`에서 `max-w-3xl` 제거:
```tsx
    <section className="flex flex-col gap-4">
```

- [ ] **Step 5: 타입 체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add "apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx" "apps/web/src/app/admin/quotes/new/page.tsx"
git commit -m "feat: 수기 견적 폼 2단 그리드 + 합계 패널"
```

---

### Task 7: `QuoteLinesEditor` 내부 실시간 합계 제거 (단일화)

두 폼이 이제 오른쪽 패널에 합계를 표시하므로, 에디터 내부의 합계 블록은 제거해 중복을 없앤다. (장비/옵션 줄별 소계 표시는 유지 — `won`은 그대로 둔다.)

**Files:**
- Modify: `apps/web/src/app/admin/_components/QuoteLinesEditor.tsx`

- [ ] **Step 1: 합계 계산 라인 제거**

함수 본문 상단에서 아래 라인 제거:
```tsx
  const totals = previewTotals(itemRowsToLines(items), buildQuoteOptions(checkedIncluded, options));
```
(`availableIncluded`·`checkedIncluded`는 포함옵션 체크박스 렌더에 필요하므로 유지.)

- [ ] **Step 2: 실시간 합계 JSX 블록 제거**

return 끝부분의 아래 블록 전체 제거:
```tsx
      {/* 실시간 합계 */}
      <div className="rounded-md border border-border bg-surface p-4">
        <TotalRow label="공급가" value={totals.supplyPrice} />
        <TotalRow label="세액 (10%)" value={totals.taxPrice} />
        <div className="my-2 border-t border-border" />
        <TotalRow label="합계" value={totals.total} strong />
      </div>
```

- [ ] **Step 3: `TotalRow` 함수 제거**

파일 하단의 `function TotalRow(...) { ... }` 정의 전체 제거(이제 `QuoteTotalsAside`로 이동했으므로 미사용).

- [ ] **Step 4: 미사용 import 정리**

상단 import에서 `previewTotals`, `buildQuoteOptions`, `itemRowsToLines` 제거(이제 에디터에서 미사용). `availableIncludedNames`·타입들은 유지. 정리 후 import:
```tsx
import {
  availableIncludedNames,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
```

- [ ] **Step 5: 타입 체크 + lint(미사용 변수 0)**

Run: `pnpm --filter @jhtechsaas/web typecheck && pnpm --filter @jhtechsaas/web lint`
Expected: PASS — 미사용 import/변수 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add "apps/web/src/app/admin/_components/QuoteLinesEditor.tsx"
git commit -m "refactor: 견적 라인 에디터 내부 합계 제거(오른쪽 패널로 단일화)"
```

---

### Task 8: 전체 게이트 검증

레이아웃·합계 위치 변경이 견적 작성·발행 흐름을 깨지 않는지 E2E로 확인하고, 머지 게이트를 모두 통과시킨다.

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: shared + web 단위 테스트**

Run: `pnpm --filter @jhtechsaas/shared test && pnpm --filter @jhtechsaas/web test`
Expected: PASS (form.test.ts 신규 포함).

- [ ] **Step 2: typecheck + lint + build**

Run: `pnpm --filter @jhtechsaas/web typecheck && pnpm --filter @jhtechsaas/web lint && pnpm --filter @jhtechsaas/web build`
Expected: 모두 PASS.

- [ ] **Step 3: `as any` 0 확인**

Run: `git diff main --stat && grep -rn "as any" apps/web/src/app/admin apps/web/src/lib/quotes || echo "as any 없음"`
Expected: 신규/수정 코드에 `as any` 없음.

- [ ] **Step 4: E2E (클린 DB + 시드 필수)**

Run:
```bash
supabase db reset
bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/web test:e2e -- quotes.spec.ts
```
Expected: PASS — `quotes.spec.ts`의 의뢰 견적 흐름(공급가 55,000,000원·합계 60,500,000원·발행 후 상태 견적발송)과 수기 견적 흐름(합계 33,000,000원) 모두 통과. 합계가 오른쪽 패널로 이동했어도 동일한 포맷 텍스트라 셀렉터 그대로 매칭.

> 시드 데이터 외에 데모 장비 카탈로그가 로컬에 남아 있으면 e2e 카탈로그 가정을 오염시킨다 — 반드시 클린 `db reset` + `seed-local`에서만 실행(CLAUDE.md 게이트 규칙).

- [ ] **Step 5: 전체 E2E 회귀**

Run: `pnpm --filter @jhtechsaas/web test:e2e`
Expected: PASS — 의뢰 상세(`applications.spec.ts`)·고객 등 회귀 없음(상세 페이지는 미변경).

- [ ] **Step 6: 시각 확인(로컬 dev, 선택)**

`db reset` + `seed-local` + 데모 데이터 삽입 후 dev 서버에서 `/admin/applications/<id>/quote/new`와 `/admin/quotes/new`를 열어 2단·sticky·반응형(좁은 화면 스택)을 눈으로 확인.

---

## Self-Review

**1. Spec coverage:**
- 의뢰 견적 2단(맥락 왼쪽 / 합계 sticky 오른쪽) → Task 3·4·5 ✅
- 수기 견적 2단(합계만) → Task 6 ✅
- 공용 합계 패널 추출 → Task 2 ✅
- 에디터 내부 합계 제거(단일화) → Task 7 ✅
- 맥락 블록 재활용(ApplicantInfo·InstallSurvey·SitePhotos) → Task 3 ✅
- 합계 폼 상단으로 끌어올리기(순수 헬퍼) → Task 1 ✅
- 반응형(lg 미만 스택, `self-start lg:sticky`) → Task 2·4·6 ✅
- DB·RPC·저장 흐름 불변 → 어느 태스크도 RPC/마이그 미변경 ✅
- 게이트 전부 통과 → Task 8 ✅

**2. Placeholder scan:** TBD/TODO/모호 지시 없음 — 모든 코드 스텝에 실제 코드 포함.

**3. Type consistency:** `formPreviewTotals(items, options, includedDeselected, catalog)` 시그니처가 Task 1 정의 ↔ Task 4·6 호출에서 일치. `QuoteTotalsAside({ totals, children })` 정의(Task 2) ↔ 사용(Task 4·6) 일치. `ApplicationContext({ id })` 정의(Task 3) ↔ 사용(Task 5) 일치. `contextSlot?: ReactNode` 정의(Task 4) ↔ 주입(Task 5) 일치. `QuoteResult` 필드(`supplyPrice`·`taxPrice`·`total`)는 기존 `QuoteLinesEditor` 사용과 동일.
