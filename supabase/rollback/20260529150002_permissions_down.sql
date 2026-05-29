-- 역: profiles 정책 + has_permission
drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop function if exists public.has_permission(uuid, text);
