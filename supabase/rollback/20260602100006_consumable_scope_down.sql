drop trigger if exists consumable_scope_server_fields on public.consumable_scope;
drop function if exists public.consumable_scope_enforce_server_fields();
drop table if exists public.consumable_scope cascade;
