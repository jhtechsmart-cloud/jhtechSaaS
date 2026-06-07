# 견적 상세 + 재발행 (E5 UI Slice C) — 설계

> **한 문장 요약**: 견적을 클릭하면 상세(줄 내역·금액·상태·버전)를 펼쳐 보고, "재발행"을 누르면 그 줄이 채워진 작성 폼이 열려 수정 후 저장하면 같은 번호 V2가 만들어진다.
> **왜 필요한가**: 채번/불변 백엔드가 이미 재발행(번호 유지 + version MAX+1)을 받쳐줌. 이 슬라이스는 그걸 화면에서 쓰게 한다 — 견적을 보고, 고쳐서 새 버전을 낸다.

## 결정 (2026-06-07)

- **재발행은 어떤 견적에서든 허용**(draft·issued 모두 → 새 V2). "복제 → 수정 → 새 버전" 흐름. 단순.

## 새로/바뀌는 것

- **견적 상세** `app/admin/quotes/[id]/page.tsx` (server) — 견적 1건 조회(RLS), 읽기전용: `quote_no`·버전·상태 배지·장비/옵션 줄 표(저장된 jsonb)·공급가/세액/합계·작성/발행일. 상단 "재발행" 버튼(quotes.write).
- **재발행 = 프리필 폼** — "재발행" → `/admin/applications/{app_id}/quote/new?from={quoteId}`. 작성 페이지가 `?from`이면 그 견적의 줄을 불러와 `QuoteForm`에 초기값 전달. 저장 시 같은 의뢰에 `create_quote` → 트리거가 V2(번호 유지). 의뢰/수기 출처 무관(둘 다 app_id 보유).
- `QuoteForm`에 선택 초기값(`initialItems`/`initialOptions`). 없으면 기존처럼 빈 장비 1줄.
- `lib/quotes/form.ts` `parseQuoteLines(value): QuoteRow[]` — 저장된 jsonb 줄을 폼 행으로 안전 변환(형 검증·코어스). **TDD 대상(순수).**
- `lib/quotes/queries.ts` `getQuote(id)` — 단건 조회(items·options·금액·application_id·status·version·날짜).
- `QuotesList` 행을 견적 상세 링크로.

## 데이터 흐름

QuotesList 행 클릭 → 견적 상세 → 재발행 → 프리필 폼(같은 줄) → 수정 → create_quote(같은 app) → 트리거 V2 → redirect 의뢰 상세 → 목록에 V2·V1.

## 테스트

- Vitest: `parseQuoteLines`(정상 jsonb→행, 비배열→[], 깨진 값 코어스).
- E2E: 견적 상세 열기(내역) → 재발행 → 줄 프리필 확인 → 금액 수정 → 발행 → 의뢰 상세에 V2 노출(번호 유지·버전 2).

## 범위 밖 (후속)

장비 카탈로그 자동가격·이미지·통합 PDF.
