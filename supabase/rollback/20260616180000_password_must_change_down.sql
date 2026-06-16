-- 20260616180000_password_must_change.sql 롤백.
alter table public.profiles
  drop column if exists must_change_password;
