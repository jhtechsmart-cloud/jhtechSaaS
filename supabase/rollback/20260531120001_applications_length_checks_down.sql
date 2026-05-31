-- E3 #4 보안 롤백 — 길이 CHECK 제약 제거.
alter table public.applications
  drop constraint if exists applications_company_len,
  drop constraint if exists applications_ceo_len,
  drop constraint if exists applications_biz_no_len,
  drop constraint if exists applications_phone_len,
  drop constraint if exists applications_email_len,
  drop constraint if exists applications_address_len,
  drop constraint if exists applications_fields_size;
