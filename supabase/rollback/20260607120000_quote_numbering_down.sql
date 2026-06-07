-- 롤백: 20260607120000_quote_numbering.sql
-- 견적번호 채번 트리거·함수·연도 카운터 제거. quotes 테이블/컬럼/제약은 E1에서 생성된 것이라 건드리지 않음.
drop trigger if exists quotes_server_fields on public.quotes;
drop function if exists public.quotes_enforce_server_fields();
drop function if exists public.next_quote_base_no();
drop table if exists public.quote_number_counters;
