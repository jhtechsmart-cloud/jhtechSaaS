-- 롤백: consumable_scope 테이블 및 관련 함수·트리거 제거
drop trigger if exists consumable_scope_server_fields on public.consumable_scope;
drop function if exists public.consumable_scope_enforce_server_fields();
drop table if exists public.consumable_scope cascade;
