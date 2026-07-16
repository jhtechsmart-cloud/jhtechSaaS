-- 서비스 리포트 PDF 상태 조회·재시도 RPC — #228 Part 3 (autoplan F12·F13 구체화).
-- jobs 테이블은 RLS 무정책(워커 전용)이라 authenticated가 직접 못 본다 →
-- 완료 화면·admin의 '생성 중/실패/재시도'는 이 DEFINER RPC로만 확인한다.

-- PDF 진행 상태: ready(pdf_url 있음) / processing(잡 대기·처리중) / failed(잡 소진) / none(잡 없음 — 비정상).
create or replace function public.get_service_report_pdf_status(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_job record;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.view_all')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;

  if v_row.pdf_url is not null then
    return jsonb_build_object('state', 'ready', 'pdf_url', v_row.pdf_url);
  end if;

  select status, last_error into v_job
    from public.jobs
    where type = 'service_report_pdf' and payload ->> 'service_report_id' = p_id::text
    order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  if v_job.status = 'failed' then
    return jsonb_build_object('state', 'failed', 'error', coalesce(v_job.last_error, ''));
  end if;
  return jsonb_build_object('state', 'processing');
end;
$$;
revoke all on function public.get_service_report_pdf_status(uuid) from public, anon;
grant execute on function public.get_service_report_pdf_status(uuid) to authenticated;

-- PDF 재시도 — failed 종단된 잡을 새 잡으로 재큐(발행본·pdf 미생성·활성 잡 없음일 때만).
create or replace function public.retry_service_report_pdf(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'users.manage')) then
    raise exception 'PDF 재시도 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if v_row.status <> 'issued' then raise exception '발행된 리포트만 재시도할 수 있습니다'; end if;
  if v_row.pdf_url is not null then raise exception '이미 PDF가 생성되어 있습니다'; end if;
  if exists (
    select 1 from public.jobs
    where type = 'service_report_pdf'
      and payload ->> 'service_report_id' = p_id::text
      and status in ('queued', 'processing')
  ) then
    raise exception '이미 생성 작업이 진행 중입니다';
  end if;

  insert into public.jobs (type, payload)
  values ('service_report_pdf', jsonb_build_object('service_report_id', p_id));
  return jsonb_build_object('state', 'processing');
end;
$$;
revoke all on function public.retry_service_report_pdf(uuid) from public, anon;
grant execute on function public.retry_service_report_pdf(uuid) to authenticated;
