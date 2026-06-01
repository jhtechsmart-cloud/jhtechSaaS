drop trigger if exists company_equipment_server_fields on public.company_equipment;
drop function if exists public.company_equipment_enforce_server_fields();
drop table if exists public.company_equipment cascade;
