# 수기 견적 (E5 UI Slice B) — 설계

> **한 문장 요약**: 영업이 의뢰 없이 그 자리서 **회사명 + 견적 줄을 입력**해 발행하면 `create_manual_quote` RPC가 `application(source=manual) + quote`를 원자 생성하고, 새 의뢰 상세로 이동한다.
> **왜 필요한가**: 의뢰사 요구 — "링크 안 보내고 영업이 현장서 직접 견적 작성". Slice A(의뢰→견적)의 짝.

## 진입점

`견적 신청` 목록(`/admin/applications`) 헤더에 **"수기 견적 작성" 버튼**(quotes.write) → `/admin/quotes/new`.

## 재사용 리팩터 (DRY)

`QuoteForm` 안의 라인 에디터 + 실시간 합계 카드를 `QuoteLinesEditor`(공유, `admin/_components/`)로 추출. `QuoteForm`(의뢰용)·`ManualQuoteForm`(수기용)이 공유. 순수 로직 `lib/quotes/form.ts`는 이미 공유 → 그대로. Slice A 동작·E2E는 불변(내부 분리만).

## 새로 만드는 것

- `app/admin/quotes/new/page.tsx` (server) — `requireQuotesWrite` → `ManualQuoteForm`.
- `app/admin/quotes/_components/ManualQuoteForm.tsx` (client) — 회사 필드(회사명 필수 + 대표자·연락처·이메일 선택) + `QuoteLinesEditor` + 임시저장/발행. 저장 시 `createManualQuoteAction`.
- `lib/quotes/actions.ts` — `createManualQuoteAction(payload)` → `supabase.rpc('create_manual_quote', {...})` → 반환 `application_id`로 `/admin/applications/{id}` redirect.
- `lib/quotes/schema.ts` — `createManualQuotePayloadSchema`(회사명 필수 + 라인 스키마 재사용 + status).
- `app/admin/applications/page.tsx` — 헤더에 수기 버튼 배선.

## 데이터 흐름

회사명+줄 입력 → 클라 실시간 합계 → 저장 시 RPC가 app(manual)+quote 원자 생성·금액 재계산·채번 → redirect 새 의뢰 상세 → 견적 목록 노출.

## 검증·에러

- 클라: 회사명 비어있지 않음 + `validateQuoteForm`(재사용).
- 서버: RPC가 권한·회사명·줄 재검증. 액션이 스키마 1차 방어.

## 테스트

- Vitest: `createManualQuotePayloadSchema` — 회사명 누락 거부·유효 통과(순수).
- E2E: 수기 견적 버튼 → 회사명+장비 입력 → 합계 → 발행 → 새 의뢰 상세에 견적 노출.

## 범위 밖 (후속)

견적 상세/재발행(Slice C)·장비 카탈로그 자동가격·PDF.
