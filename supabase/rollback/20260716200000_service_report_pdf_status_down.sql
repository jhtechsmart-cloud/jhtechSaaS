-- rollback: PDF 상태·재시도 RPC (20260716200000)
drop function if exists public.retry_service_report_pdf(uuid);
drop function if exists public.get_service_report_pdf_status(uuid);
