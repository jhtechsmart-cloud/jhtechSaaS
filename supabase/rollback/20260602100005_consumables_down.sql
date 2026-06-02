drop trigger if exists consumables_server_fields on public.consumables;
drop function if exists public.consumables_enforce_server_fields();
drop table if exists public.consumables cascade;
