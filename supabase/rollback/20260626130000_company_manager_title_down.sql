-- 롤백: 20260626130000_company_manager_title
alter table public.companies drop column if exists manager_title;
