alter table public.profiles drop constraint if exists profiles_position_len;
alter table public.profiles drop column if exists position;
