-- 롤백 #285 ①(스키마). ⚠️ 반드시 ④(정책)→③(RPC)→②(트리거)→①(이 파일) 순서로 실행.
-- ②의 down이 approved/completed 행을 issued로 되돌린 뒤여야 status CHECK 축소가 성공한다.
-- 데이터 소실: approved_*/completed_*/tax_*/parent_report_id/engineer_signature_path/pdf_revision → 실행 전 백업 테이블 생성.

create table if not exists public.service_reports_approval_backup as
  select id, status, pdf_revision, pdf_url, engineer_signature_path,
         approved_at, approved_by, approver_name, approver_title, approver_stamp_path,
         completed_at, completed_by, tax_invoice_status, tax_invoice_date, tax_invoice_memo,
         parent_report_id, now() as backed_up_at
  from public.service_reports;

-- 6. claim_next_job — 20260611120000 본문(run_after 조건 제거)
create or replace function public.claim_next_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row public.jobs;
begin
  update public.jobs
  set status = 'failed',
      last_error = 'stale: 회수 한도 초과(워커 사망 추정)',
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '5 minutes'
    and attempts >= 3;

  select id into v_id
  from public.jobs
  where status = 'queued'
     or (status = 'processing'
         and updated_at < now() - interval '5 minutes'
         and attempts < 3)
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = v_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;

-- 5. jobs
drop index if exists public.jobs_service_report_notice_active_uniq;
drop index if exists public.jobs_service_report_pdf_queued_uniq;
drop index if exists public.jobs_claim_idx;
alter table public.jobs drop column if exists run_after;

-- 4. email_log
drop index if exists public.email_log_active_service_report;
create unique index email_log_active_service_report
  on public.email_log (service_report_id)
  where status in ('pending', 'sending', 'sent');
alter table public.email_log drop column if exists kind;

-- 3. profiles
alter table public.profiles drop column if exists approval_stamp_path;

-- 2. service_reports 인덱스·제약·컬럼
drop index if exists public.service_reports_follow_open;
create index service_reports_follow_open on public.service_reports (follow_date)
  where follow_needed and follow_resolved_at is null and status = 'issued';
drop index if exists public.service_reports_parent_idx;
drop index if exists public.service_reports_status_idx;
alter table public.service_reports
  drop constraint if exists service_reports_engineer_sig_path_check,
  drop constraint if exists service_reports_approved_at_check,
  drop constraint if exists service_reports_completed_tax_check,
  drop column if exists parent_report_id,
  drop column if exists tax_invoice_memo,
  drop column if exists tax_invoice_date,
  drop column if exists tax_invoice_status,
  drop column if exists completed_by,
  drop column if exists completed_at,
  drop column if exists approver_stamp_path,
  drop column if exists approver_title,
  drop column if exists approver_name,
  drop column if exists approved_by,
  drop column if exists approved_at,
  drop column if exists pdf_revision,
  drop column if exists engineer_signature_path;

-- 1. 상태 CHECK 축소(approved/completed 행이 남아 있으면 여기서 실패 — ② down 선행 필수)
alter table public.service_reports drop constraint if exists service_reports_status_check;
alter table public.service_reports
  add constraint service_reports_status_check check (status in ('draft', 'issued', 'voided'));

select count(*) as backup_rows from public.service_reports_approval_backup;
