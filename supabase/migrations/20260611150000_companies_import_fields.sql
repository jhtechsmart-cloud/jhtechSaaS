-- 거래처 엑셀 이관 — companies에 구 시스템 대조키·휴대폰 추가.
--  - ledger_no: 회계 프로그램의 장부번호(101~1580). 이관 멱등키(재실행 시 기존 행 식별) +
--    향후 "옛 장부 NNN이 누구?" 대조용. 값이 있으면 유일(부분 UNIQUE — null 다수 허용).
--  - mobile: 휴대폰(엑셀 343건). 영업 연락 핵심이라 note가 아닌 컬럼으로.
-- 단순 사용자 편집 컬럼 — RLS·트리거 변경 없음(#5a 확장필드와 동일 패턴).
-- rollback: supabase/rollback/20260611150000_companies_import_fields_down.sql

alter table public.companies
  add column if not exists ledger_no integer,  -- 구 시스템 장부번호(대조키)
  add column if not exists mobile text;        -- 휴대폰

alter table public.companies
  add constraint companies_ledger_no_positive check (ledger_no is null or ledger_no > 0),
  add constraint companies_mobile_len check (mobile is null or char_length(mobile) <= 50);

create unique index companies_ledger_no_unique on public.companies (ledger_no) where ledger_no is not null;
