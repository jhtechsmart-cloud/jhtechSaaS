-- 롤백 — AS 히스토리 1b 읽기전용 권한 (#246)
-- 정책을 직전(20260716170000 / 20260716170100 / 20260604120000) 정의로 복원한다.
-- profiles.permissions에 수동 부여된 'service_reports.view' 값은 무해하게 남는다(정책이 사라지면 무효 키).

drop policy if exists service_reports_select on public.service_reports;
create policy service_reports_select on public.service_reports
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
    or (status in ('issued', 'voided')
        and (select public.has_permission((select auth.uid()), 'service_reports.write')))
  );

drop policy if exists service_reports_objects_read on storage.objects;
create policy service_reports_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'service-reports'
    and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
         or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
  );

drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'email.send'))
    or (
      service_report_id is not null
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
    )
  );

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
  );

-- get_service_report_pdf_status는 20260716200000_service_report_pdf_status.sql 재실행으로 복원.
