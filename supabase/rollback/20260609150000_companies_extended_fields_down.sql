-- 롤백: 20260609150000_companies_extended_fields.sql
-- companies 확장 8컬럼 + 길이 CHECK 제거. (DROP COLUMN이 의존 CHECK도 함께 제거)

alter table public.companies
  drop column if exists manager,
  drop column if exists biz_type,
  drop column if exists biz_item,
  drop column if exists ledger_name,
  drop column if exists phone1,
  drop column if exists phone2,
  drop column if exists fax,
  drop column if exists address_actual1,
  drop column if exists address_actual2;
