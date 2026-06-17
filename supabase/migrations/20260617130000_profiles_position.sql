-- 계정 직책(position). 연락처(phone)는 20260610120000에 이미 있음 → 재사용.
alter table public.profiles
  add column if not exists position text;
alter table public.profiles
  add constraint profiles_position_len check (position is null or char_length(position) <= 50);
