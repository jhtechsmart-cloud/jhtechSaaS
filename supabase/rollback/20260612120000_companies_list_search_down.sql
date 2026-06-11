-- 롤백 — 고객 목록 뷰·검색 컬럼·인덱스 제거(pg_trgm 확장은 공용이라 유지).
drop view if exists public.companies_list;
drop index if exists public.companies_name_trgm_idx;
drop index if exists public.companies_search_digits_trgm_idx;
drop index if exists public.applications_biz_no_digits_idx;
alter table public.companies drop column if exists search_digits;
alter table public.applications drop column if exists biz_no_digits;
