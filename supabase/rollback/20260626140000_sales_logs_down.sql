-- 롤백: 20260626140000_sales_logs
drop trigger if exists sales_logs_server_fields on public.sales_logs;
drop table if exists public.sales_logs;
drop function if exists public.sales_logs_enforce_server_fields();
