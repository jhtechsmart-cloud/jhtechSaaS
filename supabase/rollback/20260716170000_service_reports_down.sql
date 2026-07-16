-- rollback: 서비스 리포트 테이블·버킷 (20260716170000)
drop policy if exists service_reports_objects_delete on storage.objects;
drop policy if exists service_reports_objects_read on storage.objects;
drop policy if exists service_reports_objects_insert on storage.objects;
delete from storage.buckets where id = 'service-reports';
drop table if exists public.service_reports cascade;
drop function if exists public.service_reports_before_update();
drop function if exists public.service_reports_before_insert();
drop function if exists public.next_service_report_seq_no();
drop sequence if exists public.service_report_seq;
