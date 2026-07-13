-- 롤백: 고객 중복 조회 RPC 제거.
drop function if exists public.check_company_duplicate(text, text, text, uuid);
