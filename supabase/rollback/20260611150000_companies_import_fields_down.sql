-- 롤백 — companies 이관 필드(ledger_no·mobile) 제거.
drop index if exists public.companies_ledger_no_unique;
alter table public.companies
  drop constraint if exists companies_ledger_no_positive,
  drop constraint if exists companies_mobile_len;
alter table public.companies
  drop column if exists ledger_no,
  drop column if exists mobile;
