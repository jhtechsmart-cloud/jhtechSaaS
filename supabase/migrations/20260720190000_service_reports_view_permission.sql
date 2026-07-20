-- AS 히스토리 Part 1b — 영업 읽기전용 조회 권한 + 기사 보유장비 조회 (#246)
--
-- 왜 view_all이 아닌가: RLS 세 갈래 중 view_all만이 draft(작성 중)를 포함한다. 영업에게 주면
-- 기사의 서명 전·금액 미확정·진단 미완성 문서가 그대로 보이고, 그걸 보고 고객에게 말하면
-- 되돌릴 수 없는 사고다. 발행(issued)·무효(voided)본만 여는 읽기전용 키를 새로 판다.
--
-- ⚠️ 스토리지가 핵심: 현행 read 정책은 버킷 전체를 조건 없이 허용해서, 새 키를 그냥 OR로
-- 얹으면 테이블은 막고 파일(서명 이미지·현장 사진)로 그대로 샌다. 리포트 스코프를 붙여
-- 기존 홀(기사 A가 기사 B의 draft 사진 열람)까지 함께 닫는다.

-- ─────────────────────────────────────────────────────────────
-- ① 리포트 SELECT — 세 번째 갈래(발행·무효본)에 읽기전용 키 추가.
--    draft는 여전히 작성자 본인 또는 view_all만. 누출 없음.
drop policy if exists service_reports_select on public.service_reports;
create policy service_reports_select on public.service_reports
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
    or (
      status in ('issued', 'voided')
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view')))
    )
  );

-- ─────────────────────────────────────────────────────────────
-- ② 스토리지 read — 버킷 전체 허용을 리포트 스코프로 좁힌다.
--    본인 리포트 폴더이거나, 발행·무효본 폴더일 때만. draft 첨부는 작성자만 본다.
drop policy if exists service_reports_objects_read on storage.objects;
create policy service_reports_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'service-reports'
    and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
         or (select public.has_permission((select auth.uid()), 'service_reports.view'))
         or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
    and (
      (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
      or exists (
        select 1 from public.service_reports r
        where r.id = split_part(name, '/', 1)::uuid
          and ( r.created_by = (select auth.uid())
                or r.status in ('issued', 'voided') )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- ③ email_log — 발송 상태 열람에 읽기전용 키 추가(완료 화면·admin 목록의 '발송됨' 표기).
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'email.send'))
    or (
      service_report_id is not null
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
    )
  );

-- ─────────────────────────────────────────────────────────────
-- ④ PDF 상태 RPC — 권한 검사에 읽기전용 키 추가.
--    (jobs 테이블은 정책이 없어 DEFINER RPC로만 상태를 노출한다)
create or replace function public.get_service_report_pdf_status(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_job record;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.view')
          or public.has_permission(v_uid, 'service_reports.view_all')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;

  if v_row.pdf_url is not null then
    return jsonb_build_object('state', 'ready', 'pdf_url', v_row.pdf_url);
  end if;

  select j.status, j.last_error into v_job
    from public.jobs j
   where j.type = 'service_report_pdf'
     and j.payload ->> 'service_report_id' = p_id::text
   order by j.created_at desc
   limit 1;

  if not found then return jsonb_build_object('state', 'none'); end if;
  if v_job.status = 'failed' then
    return jsonb_build_object('state', 'failed', 'error', coalesce(v_job.last_error, '알 수 없는 오류'));
  end if;
  return jsonb_build_object('state', 'processing');
end;
$$;
revoke all on function public.get_service_report_pdf_status(uuid) from public, anon;
grant execute on function public.get_service_report_pdf_status(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- ⑤ 기사의 보유장비 조회 — 현장 콘솔 2단계가 항상 빈 목록으로 뜨던 문제.
--    company_equipment_select는 "그 고객의 담당자 또는 customers.view_all"만 허용해서,
--    service_reports.write만 가진 기사 계정은 어느 고객에서도 보유장비를 0건으로 본다.
--    결과적으로 기사가 매번 직접입력을 하게 되고 1a의 재사용 로직 효과가 반감된다.
--    ⚠️ 읽기만 연다. 쓰기(INSERT/UPDATE/DELETE)는 customers.edit 그대로 — 기사는 조회 전용.
drop policy if exists company_equipment_select on public.company_equipment;
create policy company_equipment_select on public.company_equipment
  for select to authenticated using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          c.assignee_id = (select auth.uid())
          or (select public.has_permission((select auth.uid()), 'customers.view_all'))
        )
    )
    or (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );

-- 기존 계정 권한 백필은 하지 않는다. profiles.permissions는 자유 배열이고 #229로 개별 편집이
-- 가능해져 "기존 영업 계정"의 판별식이 없다. 조건부 array_append는 의도적으로 권한을 줄여둔
-- 계정까지 덮고 원상태 기록도 남지 않는다. 계정 10개 미만이므로 /admin/users에서 부여한다.
