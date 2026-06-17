# 견적 메일 재발송 — 설계 (Spec)

**작성일**: 2026-06-17 · **상태**: 승인됨 → 구현 대기

## 한 문장 요약
이미 발송한 견적도 올바른/다른 주소로 다시 보낼 수 있게, 멱등 잠금을 "발송 *진행 중*"으로만 좁히고 재발송 UI를 추가한다.

## 왜 필요한가 (비전문가용)
고객이 "메일 서버 문제·메일함이 꽉 참"으로 못 받거나, 받는 주소에 **오타**가 있거나, **다른 주소로 보내달라**고 하는 경우가 실제로 생긴다. 지금은 한 견적을 한 번 보내면 `email_log`에 `sent` 행이 남고, **유니크 잠금이 그걸 영구 차단**해서 다시 못 보낸다. 이 잠금은 원래 "더블클릭·워커 재시도로 인한 *실수 중복 발송*"을 막으려던 것인데, **의도적 재발송까지 막아버린 게 과했다.**

핵심 구분:
- **실수 중복** = 같은 발송이 짧은 시간에 두 번 (더블클릭·재시도) → 여전히 막아야 함.
- **의도적 재발송** = 사람이 나중에 일부러 다시 보냄 (오타·반송·다른 주소) → 허용해야 함.

해결 = 잠금을 "**발송 진행 중**(`pending`·`sending`)"일 때만 걸고, 발송 완료(`sent`)·실패(`failed`)면 새 발송을 허용. 진행 중 1건만 허용하므로 더블클릭/재시도 중복은 그대로 차단된다.

## 현재 동작 (확인됨)
- 마이그 `20260616170000_quote_email.sql`:
  - 부분 유니크 인덱스 `email_log_active_quote on email_log(quote_id) where status in ('pending','sending','sent')`.
  - `enqueue_quote_email` RPC: `exists(... status in ('pending','sending','sent'))` 면 "이미 발송했거나 발송 대기 중인 견적입니다" 예외.
- `page.tsx`(applications/[id]): `email_log`에서 `created_at desc limit 1` = **최신 발송 행의 status**만 가져와 `emailStatus`로 전달. (여러 행이 생겨도 자동으로 "마지막 상태")
- `SendQuoteEmailModal`: `sent`면 **버튼 없이 죽은 배지 "✓ 메일 발송됨"**(재발송 불가). `failed`면 이미 "메일 재발송" 버튼 존재. `pending/sending`이면 "메일 발송 중…".

## 변경 (3군데)

### 1. DB 마이그레이션 (`supabase/migrations/<ts>_quote_email_resend.sql` + 롤백)
- `email_log_active_quote` 인덱스 drop & recreate: 술어 `where status in ('pending','sending')` (= **'sent' 제거**).
- `enqueue_quote_email` RPC 중복검사를 `status in ('pending','sending')` 로, 에러문구를 **"이미 발송 진행 중인 견적입니다"** 로. (그 외 로직·시그니처 불변)
- 롤백 = `supabase/rollback/<ts>_quote_email_resend_down.sql` (인덱스·RPC를 이전 술어로 복원).
- db-test (`packages/db-tests`):
  1. `sent` 행이 있는 견적도 `enqueue_quote_email` 재호출 시 **새 pending 행 생성**(허용).
  2. `pending`/`sending` 진행 중이면 여전히 **차단**(예외).
  3. 같은 견적에 `sent` 행 여러 개 공존 가능(부분 유니크가 안 막음) + 진행 중은 1건만.

### 2. 백엔드 쿼리 (`applications/[id]/page.tsx`)
- 최신 `email_log` 행에서 `status`뿐 아니라 **`to_email`·`status`·`created_at`(또는 `sent_at`)** 까지 select → `lastSend = { to, status, at }` 를 `QuoteSummaryPanel` → `SendQuoteEmailModal` 로 전달.

### 3. UI (`SendQuoteEmailModal`)
- `sent`일 때: 죽은 배지 대신 **"✓ 발송됨" 확인 + "다른 주소로 재발송" 버튼**(모달 오픈).
- 재발송 모달 상단: 안내 한 줄 **"이미 발송된 견적입니다 — 다른 주소로 다시 보낼 수 있습니다"** + **"직전 발송: {to} ({성공|실패}, {KST 시각})"** (shared `formatKstDateTime` 재사용).
- 받는주소 프리필 = 고객 기본주소(`defaultTo`), 편집 가능. 직전 주소는 정보줄에 참고 표시.
- `failed`/`sent` 로직 통합 — 종단상태면 상태표시 + 재발송 버튼.

## 멱등성 안전성 (왜 여전히 안전한가)
- 더블클릭: 1차 클릭 → `pending` 행. 2차(수 ms 뒤) → RPC가 `pending` 존재 확인 → 차단. (발송은 enqueue→워커폴링→hiworks로 수 초 소요라, 더블클릭 시점엔 항상 `pending`/`sending`)
- 워커 재시도: 같은 잡의 CAS 락(`pending→sending`)이 이미 1회만 발송 보장(불변).
- 부분 유니크(`pending`·`sending`)가 동시 enqueue 2건을 DB 레벨에서 백스톱.

## 테스트 / 게이트
- `@jhtechsaas/db-tests test:rls`(위 3 시나리오) · web `typecheck`·`lint`·`build` · 기존 `e2e` 회귀 · `as any` 0.
- shared 로직 변경 없음(템플릿/발송기 불변).
- db-test 전 `supabase db reset` + `seed-local.sh`.

## 범위 밖 (YAGNI)
- 전체 발송 이력 목록 UI(이번엔 모달의 "직전 발송"만).
- PDF 첨부(첨부 가능 여부 미확인 — 별건).
- 자동 재시도 정책 변경(워커 재시도 한도 불변).

## 산출물 위치
- 견적 상세: `apps/web/src/app/admin/applications/[id]/`
- 마이그: `supabase/migrations/`, 롤백: `supabase/rollback/`
- db-test: `packages/db-tests/src/`
