-- 롤백 #285 ④(정책). 가장 먼저 실행(④→③→②→①).
-- 직인 버킷은 객체가 남아 있으면 삭제 실패하므로 유지한다(정책만 제거 — 접근 불가 상태로 남음).

drop policy if exists approval_stamps_delete on storage.objects;
drop policy if exists approval_stamps_insert on storage.objects;
drop policy if exists approval_stamps_read on storage.objects;

-- 4. INSERT — 20260716170000 본문(기사 서명 파일 제외)
drop policy if exists service_reports_objects_insert on storage.objects;
create policy service_reports_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'service-reports'
    and (
      name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(before|after)-[1-6]\.(jpg|jpeg|png|webp)$'
      or name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signature\.png$'
    )
    and exists (
      select 1 from public.service_reports r
      where r.id = split_part(name, '/', 1)::uuid
        and r.created_by = (select auth.uid())
        and r.status = 'draft'
    )
    and (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );

-- 3. read — 20260720190000 ② 본문
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

-- 2. email_log — 20260720190000 ③ 본문(kind 조건 없음 — ① down에서 kind 컬럼이 사라지므로 여기서 먼저 제거)
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

-- 1. service_reports SELECT — 20260720190000 ① 본문
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
