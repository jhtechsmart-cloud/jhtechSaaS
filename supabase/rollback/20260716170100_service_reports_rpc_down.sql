-- rollback: 서비스 리포트 RPC·트리거·email_log 확장 (20260716170100)
drop trigger if exists service_reports_enqueue_email_trg on public.service_reports;
drop function if exists public.service_reports_enqueue_email();
drop trigger if exists service_reports_enqueue_pdf_trg on public.service_reports;
drop function if exists public.service_reports_enqueue_pdf();
drop function if exists public.list_open_service_requests(uuid);
drop function if exists public.resolve_service_report_follow(uuid);
drop function if exists public.void_service_report(uuid, text);
drop function if exists public.issue_service_report(uuid);
drop function if exists public.upsert_service_report(uuid, jsonb);
drop index if exists public.email_log_active_service_report;
drop index if exists public.email_log_service_report_idx;
alter table public.email_log drop column if exists service_report_id;
