-- 역: applications + 트리거 함수 + 채번 함수 + 전역 sequence
drop table if exists public.applications;
drop function if exists public.applications_enforce_server_fields();
drop function if exists public.next_application_seq_no();
drop sequence if exists public.application_seq;
