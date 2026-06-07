# 견적 작성 폼 (E5 UI Slice A) — 설계

> **한 문장 요약**: 의뢰 상세에서 "견적 작성" → 장비·옵션 줄을 입력하면 **실시간으로 공급가·세액·합계가 갱신**되고, 임시저장(draft) 또는 발행(issued)하면 `create_quote` RPC가 저장·채번한다. 만든 견적은 의뢰 상세에 목록으로 보인다.
> **왜 필요한가**: E5 백엔드 3종(계산엔진·채번/불변·생성RPC)을 영업이 실제로 쓰는 첫 화면. 이게 있어야 견적이 사람 손으로 만들어진다.

## 결정 (2026-06-07)

- **장비/옵션 = 자유 텍스트 이름 + 수기 단가**. 의뢰사 옵션 가격표·카탈로그 자동가격·이미지는 대기 → 후속 슬라이스. v1은 영업이 직접 입력.
- **저장 = 임시저장(draft) + 발행(issued) 두 버튼**. 발행하면 불변(트리거가 강제).
- 첫 슬라이스 범위 = 의뢰→견적작성 폼 + 의뢰 상세에 견적 목록. 수기경로(B)·견적 상세/재발행(C)·PDF는 후속.

## 화면 레이아웃 (콘솔 v3 톤 — 소프트 인디고, tabular-nums, 상태 색 스파인)

```
의뢰 상세
 [회사명 · 상태배지]        [견적 작성]  ← quotes.write 보유 시
 ▸ 견적 (N)
   JHQ-20260607-001-V2  발행   60,500,000원   06-07
   JHQ-20260607-001-V1  임시   55,000,000원   06-07

견적 작성 폼 (/admin/applications/[id]/quote/new)
 장비
   [이름] [단가] [수량] [= 라인합계] [×]   + 장비 추가
 옵션
   [이름] [단가] [수량] [= 라인합계] [×]   + 옵션 추가
 ──────────────
 공급가 / 세액 / 합계  ← calculateQuote 실시간(tabular-nums, 천단위 콤마)
   [임시저장]  [발행하기]
```

## 컴포넌트 (각각 독립·테스트 가능)

- `lib/quotes/form.ts` (순수 로직) — 폼 행(`QuoteRow{name,unitPrice,quantity}`) ↔ `QuoteInput` 변환(`rowsToQuoteInput`), 미리보기 합계(`previewTotals` = calculateQuote 래핑), 폼 검증(`validateQuoteForm`: 장비 ≥1줄·각 줄 이름·수량≥1·단가 정수). **여기가 TDD 핵심(순수).**
- `lib/quotes/schema.ts` — 서버액션 입력 Zod(슬라이스1 `QuoteInputSchema` 기반 + 장비 ≥1줄·status 'draft'|'issued').
- `lib/quotes/actions.ts` — `createQuoteAction(applicationId, payload)` 서버액션 → `supabase.rpc('create_quote', {...})`. 기존 customers actions 패턴(서버 클라이언트·에러 반환·revalidate·redirect).
- `lib/auth/guard.ts` — `requireQuotesWrite` 추가(기존 require* 패턴).
- `app/admin/applications/[id]/quote/new/page.tsx` (server) — 권한 가드 + 의뢰 존재 확인 → `QuoteForm` 렌더.
- `app/admin/applications/[id]/_components/QuoteForm.tsx` (client) — 행 상태(items·options) + 실시간 합계 + 저장 버튼. 저장 시 서버액션 호출.
- `app/admin/applications/[id]/_components/QuotesList.tsx` — 그 의뢰의 견적 목록(quote_no·version·status 배지·합계·일자). 의뢰 상세 page에서 RLS quotes_select로 조회해 전달.

## 데이터 흐름

입력 → 클라 `calculateQuote`(미리보기) → 저장 시 서버액션이 **items·options만** RPC에 전달 → RPC가 금액 재계산(서버 권위) → 트리거 채번 → redirect 의뢰 상세 → QuotesList에 노출.

## 검증·에러

- 클라(`validateQuoteForm`): 장비 ≥1줄, 각 줄 이름 비어있지 않음·수량 정수≥1·단가 정수.
- 서버(RPC): 권한(quotes.write)·줄 재검증. 실패 시 서버액션이 에러 메시지 반환 → 폼 상단 표시.

## 테스트

- **Vitest(순수)**: `lib/quotes/form.ts` — 행 변환·미리보기 합계가 `calculateQuote`와 일치·검증(장비0줄·빈이름·수량0 거부).
- **Playwright E2E**: 로그인 → 의뢰 → 견적작성 → 장비·옵션 입력 → 합계 확인 → 발행 → 의뢰 상세 견적 목록에 노출 + 발행 배지.

## 범위 밖 (후속)

수기 견적(create_manual_quote 화면)·견적 상세/재발행·장비 카탈로그 자동가격·이미지·통합 PDF.
