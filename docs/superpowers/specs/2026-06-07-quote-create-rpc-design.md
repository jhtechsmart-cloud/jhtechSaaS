# 견적 생성 결선 RPC (E5 백엔드 #2) — 설계

> **한 문장 요약**: 영업이 견적을 저장하면 **SQL SECURITY DEFINER RPC가 items·옵션만 받아 금액을 직접 계산해 `quotes`에 저장**(클라가 보낸 금액 무시), 채번 트리거가 번호를 매긴다. 기존 의뢰 위에 만드는 경로 + 수기로 새로 만드는 경로 둘 다.
> **왜 필요한가**: 슬라이스1(계산 엔진)·슬라이스2(채번·불변)를 실제 저장 흐름으로 잇는 "결선". 서버가 금액의 최종 권위를 가져 "items와 금액이 안 맞는 견적"을 원천 차단하고, 화면 없이도 db-test로 완결 검증된다.

## 아키텍처 결정 (2026-06-07)

- 인증 쓰기지만 **SECURITY DEFINER RPC** 채택. 근거: ① 서버 금액권위(클라 금액 무시·재계산) ② 화면 없이 db-test 완결 ③ 수기경로 = application+quote 원자 생성. 기존 `submit_application`·`upsert_company_from_application` RPC 선례와 일관.
- RLS 우회하므로 RPC가 `has_permission(auth.uid(), 'quotes.write')`를 **명시 체크**.
- 금액 계산식은 슬라이스1 TS 엔진(`calculateQuote`)과 동일: `supply = Σ(단가×수량)`, `tax = round(supply×0.1)`(원단위 반올림), `total = supply+tax`. TS 엔진은 **화면 즉석 미리보기용**으로 남고, 저장 권위는 RPC. **교차검증 테스트로 TS==SQL 보장**(이중 구현 드리프트 방지).

## 1. `applications.source` 컬럼 (마이그레이션)

- `source text not null default 'public' check (source in ('public','manual'))`.
- 'public'=공개폼 제출(submit_application 경로, 기본값으로 자동), 'manual'=영업 수기 생성.
- 서버 통제값 → 기존 `applications_enforce_server_fields` 트리거 UPDATE 분기에 `new.source := old.source` 추가(변조 차단).

## 2. 내부 헬퍼 `_quote_insert(p_application_id, p_items, p_options, p_status)` (중복 제거)

- jsonb 순회로 금액 계산. 줄 검증: 각 줄 `quantity`는 정수 ≥ 1, `unitPrice`는 정수(아니면 raise).
- `quotes` INSERT: items·options·supply_price·tax_price·total·status·assignee_id(= 의뢰 담당자 `?? auth.uid()`). 채번 트리거가 quote_no/version 부여.
- 두 공개 RPC가 공유(계산·검증·insert 로직 한 곳).

## 3. `create_quote(p_application_id, p_items, p_options, p_status default 'draft')` RPC

- quotes.write 체크 → application 존재 확인 → `_quote_insert` → 생성된 quote(id·quote_no·version·supply·tax·total) 반환.
- p_status 'draft' 기본, 'issued' 즉시발행 허용(트리거가 issued_at 기록).

## 4. `create_manual_quote(p_company, p_ceo, p_phone, p_email, p_items, p_options, p_status default 'draft')` RPC

- quotes.write 체크 → **한 트랜잭션**(RPC는 단일 tx): applications INSERT(source='manual', company 필수·나머지 선택, assignee_id=auth.uid(), status='quoted') → `_quote_insert` → {application_id, quote} 반환. orphan 없음.
- 최소 application 필드 = company(필수) + ceo/phone/email(선택). 의뢰사 양식이 더 요구하면 후속 추가.

## TDD 동작 목록 (db-tests + vitest 교차검증)

1. quotes.write 없는 사용자는 두 RPC 모두 거부
2. 금액 SQL 계산: items 50M + 옵션 2.5M×2 → supply 55M·tax 5.5M·total 60.5M
3. 클라가 보낸 금액(잘못된 값)이 있어도 무시되고 RPC가 재계산
4. 트리거 채번 작동: quote_no=`JHQ-{오늘}-NNN-V1`, version 1
5. 음수 옵션(할인/제외) 차감
6. 수기경로: application(source='manual') + quote 원자 생성, 둘 다 반환
7. 수기경로: company 누락 시 거부
8. `applications.source`: 기본 'public' · 수기 'manual' · UPDATE 시 불변
9. 줄 검증: quantity 0/음수/소수 → 거부
10. **교차검증: `calculateQuote`(TS) == RPC 결과**(여러 샘플 케이스에서 supply·tax·total 일치)

## 롤백

`supabase/rollback/<ts>_quote_create_rpc_down.sql` — RPC 3개 drop + applications.source 컬럼 drop + 트리거 source 불변 줄 원복.

## 범위 밖 (다음 슬라이스)

견적 작성 콘솔(UI) — 이 RPC들을 호출하는 영업 폼, calculateQuote 실시간 합계. 통합 PDF 워커.
