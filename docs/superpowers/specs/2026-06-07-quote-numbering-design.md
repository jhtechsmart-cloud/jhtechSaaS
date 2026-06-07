# 견적번호 채번 + 불변버전 (E5 둘째 슬라이스) — 설계

> **한 문장 요약**: 견적을 저장하면 서버가 **견적번호(JHQ-YYYYMMDD-NNN-VN)를 자동 채번**하고, 재발행은 **같은 번호 + 차수(version) 자동 증가**, 발행(issued)된 견적은 **금액 동결(불변버전)**.
> **왜 필요한가**: 견적서마다 고유 번호가 있어야 고객·이력 추적이 되고, 재발행 시 "같은 견적의 개정판"임을 번호로 드러낸다. 발행본을 못 고치게 막아야 "보낸 견적과 저장된 견적이 다른" 사고를 원천 차단한다. 서버가 강제하지 않으면 클라가 번호·버전을 위조할 수 있다.

## 확정 결정 (2026-06-07)

| 항목 | 결정 |
|---|---|
| 번호 형식 | `JHQ-YYYYMMDD-NNN-VN` (예: `JHQ-20260607-001-V1`). ※ 의뢰사 체계 제공 대기 → 함수 한 곳만 교체하면 바뀜 |
| NNN | **연도별 리셋, 1년 누적**. 2026년 첫 견적=001, 다음=002 … 2027-01-01에 001로 리셋 |
| 재발행 | **번호 유지 + 차수**: 같은 application의 v1→v2는 `JHQ-…-NNN` 동일, `-VN`만 증가 |
| 불변 범위 | **issued 행 동결**: 금액·items·options·status·assignee·issued_at 수정 불가. **단 `pdf_url`만 예외**(통합 PDF 워커가 사후 기록) |

## 스키마 변경 (새 마이그레이션)

`supabase/migrations/20260607120000_quote_numbering.sql`

### 1. 연도 카운터 테이블 (연도별 리셋의 핵심)
```sql
create table public.quote_number_counters (
  year int primary key,
  last_seq int not null default 0
);
alter table public.quote_number_counters enable row level security;
-- 정책 없음 = anon/authenticated 직접 접근 0. SECURITY DEFINER 함수만 갱신(RLS 우회).
```
- 전역 sequence는 연도 리셋이 안 되므로 사용 안 함. 대신 `ON CONFLICT (year) DO UPDATE SET last_seq = last_seq + 1 RETURNING`로 **원자적 증가**(행 잠금 → 레이스 0, 새 연도는 자동으로 새 행 → 리셋).

### 2. 채번 함수 (base 번호 생성)
```sql
create function public.next_quote_base_no() returns text
language plpgsql security definer set search_path = '' as $$
declare
  yr int := extract(year from (now() at time zone 'Asia/Seoul'))::int;
  v int;
begin
  insert into public.quote_number_counters (year, last_seq) values (yr, 1)
  on conflict (year) do update set last_seq = public.quote_number_counters.last_seq + 1
  returning last_seq into v;
  return 'JHQ-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '-'
    || case when v >= 1000 then v::text else lpad(v::text, 3, '0') end;
end; $$;
```
- KST 기준 연/날짜. NNN 3자리 0패딩, 999 초과 시 자릿수 확장(lpad 잘림 회피 — applications 패턴과 동일).

### 3. 트리거 (서버필드 강제 + 버전 도출 + 불변)
`quotes_enforce_server_fields()` BEFORE INSERT OR UPDATE:
- **INSERT**:
  - 같은 `application_id`의 최신 행 조회.
  - 없으면(첫 견적): `version=1`, `quote_no = next_quote_base_no() || '-V1'`.
  - 있으면(재발행): `version = MAX+1`, `quote_no = (기존 quote_no에서 -V숫자 접미 제거) || '-V' || version`.
  - `created_at = now()`. `status='issued'면 issued_at = now()`.
  - 클라가 보낸 quote_no·version은 **무시**(항상 서버 생성).
- **UPDATE**:
  - `quote_no·version·application_id·created_at`는 항상 OLD 보존(draft도 불변).
  - `old.status='issued'`면: `pdf_url` 외 어떤 값이라도 바뀌면 **예외**(`발행된 견적은 수정 불가, 재발행은 새 버전으로`). pdf_url만 통과.
  - draft→issued 전환 시 `issued_at = now()` 서버 기록.
- service_role도 트리거는 우회 못 함 → 일관(applications 패턴과 동일).

## 동시성

같은 application에 동시 INSERT 2건 → 둘 다 같은 version 계산 → `UNIQUE(application_id, version)`가 한 건 거부(안전망). 재발행은 의도적 단발 동작이라 충돌 빈도 0에 가까움. 카운터는 첫 견적에서만 증가하므로 갭은 무해(sequence와 동일).

## TDD 동작 목록 (db-tests)

`packages/db-tests/src/quote_numbering.test.ts` (신규) + 기존 `quotes.test.ts` "중복 version" 테스트를 새 동작으로 교체.

1. 첫 견적 INSERT → `quote_no = JHQ-{오늘KST}-001-V1`, version=1
2. 같은 application 재INSERT → version=2, `quote_no` = 같은 base + `-V2` (번호 유지)
3. 다른 application 첫 견적 → NNN 002로 증가
4. 클라가 보낸 quote_no='HACK'·version=99 무시 → 서버값으로 덮어씀
5. 카운터: last_seq 998 → 999 → 1000(4자리 확장), 다른 연도 행은 독립(연도 리셋)
6. UPDATE 시 quote_no·version·created_at 불변(바꾸려 해도 OLD 유지)
7. draft→issued 전환 시 issued_at 자동 기록
8. issued 행의 금액/items/status 수정 → 예외
9. issued 행의 pdf_url 수정 → 허용(워커 경로)
10. (회귀) 기존 RLS write/select scope 테스트 그대로 통과

## 롤백

`supabase/rollback/20260607120000_quote_numbering_down.sql` — trigger·함수·카운터 테이블 drop.

## 범위 밖 (다음 슬라이스)

견적 작성 UI, calculateQuote와의 결선(공급가·세액·합계 채우기는 서버 액션/RPC에서), 통합 PDF 생성, 가격표 조회.
