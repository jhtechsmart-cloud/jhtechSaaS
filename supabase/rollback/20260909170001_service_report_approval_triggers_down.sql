-- 롤백 #285 ②(트리거). ④→③→② 순서로 실행. ①(스키마) down 전에 approved/completed 행을 issued로 되돌린다.
-- ⚠️ 고객 메일 자동 발송 트리거는 여기서 복원하지 않는다(복원 직후 PDF 재생성이 재발송을 유발) —
--     맨 아래 주석 블록을 확인 후 수동으로 켠다.

-- 0. approved/completed → issued 되돌림(동결 트리거를 잠시 끈다. 예외 경로에서도 반드시 되켠다)
alter table public.service_reports disable trigger service_reports_bu;
do $$
begin
  update public.service_reports
     set status = 'issued',
         approved_at = null, approved_by = null, approver_name = null, approver_title = null, approver_stamp_path = null,
         completed_at = null, completed_by = null,
         tax_invoice_status = null, tax_invoice_date = null, tax_invoice_memo = null,
         pdf_url = case when pdf_url is null then null else split_part(pdf_url, '/', 1) || '/report-r1.pdf' end
   where status in ('approved', 'completed');
exception when others then
  alter table public.service_reports enable trigger service_reports_bu;
  raise;
end $$;
alter table public.service_reports enable trigger service_reports_bu;

-- 4. 알림 트리거 제거
drop trigger if exists service_reports_enqueue_approval_notice_trg on public.service_reports;
drop function if exists public.service_reports_enqueue_approval_notice();
delete from public.jobs where type = 'service_report_approval_notice' and status = 'queued';

-- 3. PDF enqueue — 20260716170100 본문
create or replace function public.service_reports_enqueue_pdf()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    insert into public.jobs (type, payload)
    values ('service_report_pdf', jsonb_build_object('service_report_id', new.id));
  end if;
  return null;
end;
$$;

-- 2. BEFORE UPDATE — 20260716170000 본문
create or replace function public.service_reports_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_allowed constant text[] := array[
    'pdf_url', 'follow_resolved_at', 'follow_resolved_by',
    'status', 'void_reason', 'voided_at', 'voided_by'
  ];
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if old.status = 'voided' then
    raise exception '무효화된 리포트는 수정할 수 없습니다';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('app.service_reports_status_change', true), '') <> '1' then
      raise exception '리포트 상태 변경은 전용 RPC로만 가능합니다';
    end if;
    if old.status = 'draft' and new.status = 'issued' then
      null;
    elsif old.status = 'issued' and new.status = 'voided' then
      if new.void_reason is null or btrim(new.void_reason) = '' then
        raise exception '무효화 사유(void_reason)가 필요합니다';
      end if;
      new.voided_at := now();
    else
      raise exception '허용되지 않는 상태 전환입니다(% → %)', old.status, new.status;
    end if;
  end if;

  if old.status = 'issued' then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception '발행된 리포트는 수정할 수 없습니다(무효화 또는 새 리포트로 정정)';
    end if;
  end if;

  return new;
end; $$;

-- 1. BEFORE INSERT — 20260716170000 본문
create or replace function public.service_reports_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := public.next_service_report_seq_no();
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  new.status := 'draft';
  new.issued_at := null;
  new.pdf_url := null;
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.follow_resolved_at := null; new.follow_resolved_by := null;
  return new;
end; $$;

-- 5. (수동) 고객 메일 자동 발송 복원 — 필요 시 아래 주석을 풀어 실행. 20260716170100 L482-510 본문.
-- create or replace function public.service_reports_enqueue_email() returns trigger language plpgsql set search_path = '' as $$
-- declare v_log_id uuid;
-- begin
--   if new.pdf_url is not null and old.pdf_url is null and new.status = 'issued'
--      and new.recipient_email is not null and new.sender_hiworks_user_id is not null then
--     begin
--       insert into public.email_log (service_report_id, to_email, status) values (new.id, new.recipient_email, 'pending') returning id into v_log_id;
--       insert into public.jobs (type, payload) values ('service_report_email', jsonb_build_object('email_log_id', v_log_id, 'service_report_id', new.id));
--     exception when unique_violation then null; end;
--   end if;
--   return null;
-- end; $$;
-- create trigger service_reports_enqueue_email_trg after update on public.service_reports for each row execute function public.service_reports_enqueue_email();
