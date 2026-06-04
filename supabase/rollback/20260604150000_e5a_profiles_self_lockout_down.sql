-- E5a /review 후속 롤백 — profiles 자가 락아웃 방어 트리거 제거.
drop trigger if exists profiles_self_lockout_guard on public.profiles;
drop function if exists public.profiles_prevent_self_lockout();
