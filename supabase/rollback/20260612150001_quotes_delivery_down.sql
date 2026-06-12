-- 납품 일정 컬럼 롤백.

alter table public.quotes
  drop column if exists delivery_date,
  drop column if exists delivery_time;
