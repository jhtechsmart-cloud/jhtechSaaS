-- 롤백: P-D service_requests (#22)
drop trigger if exists service_requests_server_fields on public.service_requests;
drop function if exists public.service_requests_enforce_server_fields();
drop table if exists public.service_requests;
drop function if exists public.next_service_request_seq_no();
drop sequence if exists public.service_request_seq;
