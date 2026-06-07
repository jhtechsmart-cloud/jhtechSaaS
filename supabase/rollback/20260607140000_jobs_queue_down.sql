-- 롤백: 20260607140000_jobs_queue.sql
-- PDF enqueue 트리거·claim RPC·jobs 큐 제거. quotes 테이블은 건드리지 않음.
drop trigger if exists quotes_enqueue_pdf_trg on public.quotes;
drop function if exists public.quotes_enqueue_pdf();
drop function if exists public.claim_next_job();
drop table if exists public.jobs;
