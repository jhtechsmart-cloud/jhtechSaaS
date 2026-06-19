-- 롤백 — spec_selection 컬럼 제거.
alter table public.quotes
  drop column if exists spec_selection;
