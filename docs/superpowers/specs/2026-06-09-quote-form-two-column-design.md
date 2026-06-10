# 견적 작성 페이지 2단 개편 — 설계

> **한 문장 요약**: 견적 작성 페이지를 의뢰 상세 페이지와 동일한 "넓은 왼쪽 + 좁은 sticky 오른쪽" 2단 구조로 바꿔, 왼쪽엔 맥락·입력 폼을, 오른쪽 고정 칸엔 실시간 합계를 둔다.
>
> **왜 필요한가**: 지금 견적 작성 페이지는 입력 폼만 덩그러니 있어 휑하고, "이 견적이 어느 회사·어떤 요청에 대한 건지" 맥락이 안 보인다. 맥락을 옆에 채우면 휑함이 해소되고, 작성하면서 대상을 눈으로 확인할 수 있다. 실시간 합계를 항상 보이는 sticky 칸으로 끌어올려 입력 중 금액을 즉시 확인한다.

- 날짜: 2026-06-09
- 브랜치: `feat/quote-form-two-column`
- 스코프: 프론트엔드 레이아웃 개편만. **DB 변경 없음**, 저장 흐름(RPC·redirect) 불변.

---

## 1. 배경 — 현재 구조

| 화면 | 경로 | 컴포넌트 |
|---|---|---|
| 의뢰 기반 견적 작성 | `/admin/applications/[id]/quote/new` | `page.tsx`(서버) → `QuoteForm`(클라) |
| 수기 견적 작성 | `/admin/quotes/new` | `page.tsx`(서버) → `ManualQuoteForm`(클라) |
| 공용 라인 에디터 | — | `admin/_components/QuoteLinesEditor.tsx` (두 폼 공유) |
| 폼 순수 로직 | — | `lib/quotes/form.ts` (`previewTotals` 등) |
| 저장 | — | 서버 액션 `createQuoteAction` / `createManualQuoteAction` → RPC `create_quote` / `create_manual_quote` |

- 현재 두 폼 모두 **풀페이지 단일 컬럼**. 실시간 합계는 `QuoteLinesEditor` **내부**에 표시된다.
- `QuoteForm`은 `?from=<quoteId>`로 재발행 프리필을 지원(같은 의뢰의 견적만).
- 금액 권위는 서버 RPC. 클라 합계는 미리보기용.

## 2. 목표 레이아웃

의뢰 상세 페이지(`/admin/applications/[id]/page.tsx`)의 `quote-frame`(맥락 왼쪽 / QUOTE SUMMARY sticky 오른쪽)과 **동일한 골격**을 따른다.

### 의뢰 기반 견적 작성
```
┌─────────────────────────────┬──────────┐
│ 신청기업 정보 (재활용)       │ 실시간   │
│ 설치설문 + 현장사진 (재활용) │ 합계     │
│ ─────────────────────────── │ (sticky) │
│ 견적 입력 폼 (장비·옵션)     │ 공급가   │
│   QuoteLinesEditor           │ 세액     │
│                              │ 합계     │
│                              │[저장/발행]│
└─────────────────────────────┴──────────┘
```

### 수기 견적 작성
```
┌─────────────────────────────┬──────────┐
│ 회사명·대표·연락처 입력 필드 │ 실시간   │
│ ─────────────────────────── │ 합계     │
│ 견적 입력 폼 (장비·옵션)     │ (sticky) │
│   QuoteLinesEditor           │ 공급가   │
│                              │ 세액·합계 │
│                              │ [저장]   │
└─────────────────────────────┴──────────┘
```

수기 견적은 의뢰 데이터가 없으므로 오른쪽엔 **맥락 블록 없이 실시간 합계만** 둔다.

## 3. 컴포넌트 설계

### 3.1 공용 실시간 합계 패널 (신규)

- 신규 컴포넌트 `QuoteTotalsAside`(가칭, `admin/_components/`).
- 입력: 폼이 들고 있는 items·options(또는 이미 계산된 `previewTotals` 결과).
- 출력: 공급가 / 세액(10%) / 합계 sticky 카드 + 저장·발행 버튼 슬롯.
- `QuoteForm`·`ManualQuoteForm` **둘 다 재활용**.
- 합계 표시는 `QuoteLinesEditor`에서 **제거**하고 이 패널로 단일화(중복 제거).

### 3.2 실시간 합계를 오른쪽으로 끌어올리기 (핵심)

문제: 합계는 폼 입력 상태(items·options·해제옵션)에 의존하는데, 그 상태는 `QuoteForm`/`ManualQuoteForm`(클라)이 들고 있다.

해법: **2단 그리드를 폼 클라이언트 컴포넌트가 직접 관리**한다.
- 폼이 자신의 상태로 `previewTotals`를 계산해 오른쪽 `QuoteTotalsAside`에 전달.
- 왼쪽 칸 = 맥락 슬롯 + `QuoteLinesEditor`, 오른쪽 칸 = `QuoteTotalsAside`.

### 3.3 맥락 블록 주입 (의뢰 견적 전용)

- 신청기업·설문·사진은 **서버 데이터** → `page.tsx`(서버)에서 렌더해 `QuoteForm`에 **ReactNode 슬롯**(`contextSlot`)으로 전달.
- 클라가 서버 데이터를 다시 불러올 필요 없음(RSC가 서버 렌더 결과를 자식으로 전달).
- 의뢰 상세 페이지가 쓰는 로드 로직·블록 컴포넌트(`quote-frame`의 신청기업·설문/사진 블록)를 **그대로 재활용**. 새로 만들지 않는다.
- `ManualQuoteForm`은 `contextSlot` 없이(또는 빈 슬롯) 동일 그리드 사용.

## 4. 데이터 흐름

```
page.tsx (서버)
  ├─ 기존: app, catalog, initialItems/Options 로드
  ├─ 추가(의뢰 견적): 신청기업·설문·사진 데이터 로드 (상세 페이지 로더 재활용)
  └─ QuoteForm(클라)에 contextSlot={<서버 렌더 블록들/>} 전달

QuoteForm / ManualQuoteForm (클라)
  ├─ 폼 상태(items·options·해제옵션) 보유 [기존 그대로]
  ├─ 2단 그리드 렌더
  │   ├─ 왼쪽: {contextSlot} + QuoteLinesEditor
  │   └─ 오른쪽: QuoteTotalsAside(previewTotals 결과 + 저장 버튼)
  └─ 저장: createQuoteAction / createManualQuoteAction → RPC [기존 그대로]
```

## 5. 반응형

- `lg` 이상: 2단(`grid lg:grid-cols-[...]`).
- `lg` 미만: 한 칸으로 스택 — 맥락 → 폼 → 합계(맨 아래). 오른쪽 칸은 `self-start lg:sticky` 패턴(의뢰 상세 페이지와 동일)으로 좁은 화면에선 sticky 해제.

## 6. 스코프 · 비범위(Non-goals)

**포함:**
- 의뢰 기반 견적 작성(`[id]/quote/new`, 재발행 `?from=` 포함) 2단 개편.
- 수기 견적(`/quotes/new`) 2단 개편(오른쪽 = 합계만).
- 공용 `QuoteTotalsAside` 추출, `QuoteLinesEditor` 내부 합계 제거.

**비범위:**
- DB 스키마·RPC·저장 흐름 변경 없음.
- 새 입력 필드 추가 없음(특기사항·영업일지 등은 별도 후속).
- 금액 계산 로직 변경 없음(`previewTotals`/`calculateQuote` 그대로).

## 7. 테스트 · 게이트

- **순수 로직**: 합계 계산은 기존 `lib/quotes/form.ts`의 `previewTotals` 단위테스트로 이미 커버(새 계산 로직 없음).
- **컴포넌트/통합**: 배치 개편이 핵심 → e2e(견적 작성·발행 흐름)로 회귀 확인. 합계가 오른쪽에서도 정확히 표시되는지, 저장 흐름이 그대로인지.
- **게이트**(머지 전 전부 GREEN): `pnpm --filter @jhtechsaas/shared test`·`web test`·`web typecheck`·`lint`·`build`·`web test:e2e`·`as any` 0. DB 변경 없으므로 db-tests 영향 없음(클린 reset+seed에서 e2e 실행).
- 시각 검증은 로컬 dev(`db reset` 후 `seed-local.sh` + 데모 데이터)로 확인.

## 8. 리스크 · 완화

| 리스크 | 완화 |
|---|---|
| 합계를 폼 밖으로 옮기다 입력↔합계 연동이 끊김 | 그리드를 폼 클라 컴포넌트가 직접 관리해 상태 단일 소유 유지 |
| 맥락 블록 컴포넌트가 "발행 견적" 전용 props라 재사용 어려움 | plan 단계에서 상세 페이지 블록의 실제 props 확인 후, app 기반이면 그대로/아니면 최소 조정 |
| 좁은 화면에서 sticky가 어색 | `self-start lg:sticky` 패턴(상세 페이지 검증됨) 재사용 |
