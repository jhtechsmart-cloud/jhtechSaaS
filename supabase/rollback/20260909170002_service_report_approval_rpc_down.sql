-- 롤백 #285 ③(RPC). ④(정책) down 뒤, ②(트리거) down 앞에 실행. 자기완결형(원본 파일 재실행 불필요).
-- 원본: void/resolve = 20260716170100, retry = 20260716200000 → 본문 그대로 아래 포함.
--        upsert/issue = 20260720170000, pdf_status = 20260720190000 → 두 파일은 create or replace/if not exists만이라 재실행 안전:
--        psql -f supabase/migrations/20260720170000_service_report_catalog_link.sql
--        psql -f supabase/migrations/20260720190000_service_reports_view_permission.sql
--        (① down 전, 즉 컬럼이 아직 있을 때 실행. 20260720190000의 정책 복원은 ④ down과 중복 적용 무해)
-- ⚠️ 20260716170100 파일 전체를 재실행하면 안 된다 — 'create trigger ... enqueue_pdf_trg'가 already exists로 중단되고
--    그 뒤의 자동 메일 트리거가 되살아난다(② down 정책과 충돌).

drop function if exists public.get_service_report_approval_notice(uuid);
drop function if exists public.service_report_kpis();
drop function if exists public.enqueue_service_report_email(uuid);
drop function if exists public.complete_service_report(uuid, text, date, text);
drop function if exists public.approve_service_report(uuid);
drop function if exists public.service_request_reevaluate_done(uuid);

-- void_service_report — 20260716170100 본문
create or replace function public.void_service_report(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not public.has_permission(v_uid, 'users.manage') then
    raise exception '리포트 무효화 권한이 없습니다(관리자 전용)' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception '무효화 사유가 필요합니다';
  end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports
    set status = 'voided', void_reason = left(btrim(p_reason), 500), voided_by = v_uid
    where id = p_id and status = 'issued'
    returning * into v_row;
  if not found then
    raise exception '발행된 리포트만 무효화할 수 있습니다';
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.void_service_report(uuid, text) from public, anon;
grant execute on function public.void_service_report(uuid, text) to authenticated;

-- resolve_service_report_follow — 20260716170100 본문
create or replace function public.resolve_service_report_follow(p_id uuid)
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
          or public.has_permission(v_uid, 'service_requests.status')) then
    raise exception '후속조치 처리 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  update public.service_reports
    set follow_resolved_at = now(), follow_resolved_by = v_uid
    where id = p_id and status = 'issued' and follow_needed and follow_resolved_at is null
    returning * into v_row;
  if not found then
    raise exception '처리할 후속조치가 없습니다';
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.resolve_service_report_follow(uuid) from public, anon;
grant execute on function public.resolve_service_report_follow(uuid) to authenticated;

-- retry_service_report_pdf — 20260716200000 본문
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

-- 이어서: psql -f 20260720170000_service_report_catalog_link.sql → psql -f 20260720190000_service_reports_view_permission.sql → ② down → ① down
