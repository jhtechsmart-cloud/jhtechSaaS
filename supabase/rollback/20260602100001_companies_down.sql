drop trigger if exists companies_server_fields on public.companies;
drop function if exists public.companies_enforce_server_fields();
drop table if exists public.companies cascade;
