-- #285 ④ 정책. 권한 키 동기화 9곳 중 DB 3곳(테이블 RLS·email_log·스토리지) + 직인 버킷.
-- 원본: service_reports_select / objects_read / email_log_select = 20260720190000, objects_insert = 20260716170000.
-- ⚠️ 승인(approve)·완료(complete)만 가진 계정은 이 정책 없이는 리포트 목록이 0건이다(RLS가 최종 강제).

-- 1. service_reports SELECT — 4권한 × 발행 이후 4상태. draft는 여전히 작성자 본인 또는 view_all만.
drop policy if exists service_reports_select on public.service_reports;
create policy service_reports_select on public.service_reports
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
    or (
      status in ('issued', 'approved', 'completed', 'voided')
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view'))
           or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
           or (select public.has_permission((select auth.uid()), 'service_reports.complete')))
    )
  );

-- 2. email_log SELECT — 승인 알림 행(kind=approval_notice, 승인자 개인 메일 주소)은 일반 조회에서 제외.
--    알림 이력은 get_service_report_approval_notice RPC가 count/time만 돌려준다(D-C27).
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated using (
    kind = 'customer'
    and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or (select public.has_permission((select auth.uid()), 'email.send'))
      or (
        service_report_id is not null
        and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
             or (select public.has_permission((select auth.uid()), 'service_reports.view'))
             or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
             or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
             or (select public.has_permission((select auth.uid()), 'service_reports.complete')))
      )
    )
  );

-- 3. 스토리지 service-reports read — 폴더의 리포트 상태로 판정(D-C10).
--    view_all은 전체(세션27 결정 유지). 그 외 4권한은 발행 이후 4상태 폴더 + 본인 작성 draft만.
drop policy if exists service_reports_objects_read on storage.objects;
create policy service_reports_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'service-reports'
    and (
      (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
      or exists (
        select 1 from public.service_reports r
        where r.id = split_part(name, '/', 1)::uuid
          and (
            r.created_by = (select auth.uid())
            or (
              r.status in ('issued', 'approved', 'completed', 'voided')
              and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
                   or (select public.has_permission((select auth.uid()), 'service_reports.view'))
                   or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
                   or (select public.has_permission((select auth.uid()), 'service_reports.complete')))
            )
          )
      )
    )
  );

-- 4. 스토리지 service-reports INSERT — 기사 서명 파일(engineer-signature.png) 허용. 본인 소유 draft 폴더 조건 그대로.
--    (DELETE 정책은 경로 무관 본인 draft 폴더 조건이라 변경 불필요)
drop policy if exists service_reports_objects_insert on storage.objects;
create policy service_reports_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'service-reports'
    and (
      name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(before|after)-[1-6]\.(jpg|jpeg|png|webp)$'
      or name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(signature|engineer-signature)\.png$'
    )
    and exists (
      select 1 from public.service_reports r
      where r.id = split_part(name, '/', 1)::uuid
        and r.created_by = (select auth.uid())
        and r.status = 'draft'
    )
    and (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );

-- 5. 직인 버킷 — 비공개, 관리자(users.manage) 전용, 버전 파일명 강제(덮어쓰기·UPDATE 정책 없음 → 승인본 스냅샷 불변).
--    워커는 service_role로 읽어 리포트 폴더로 복사한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('approval-stamps', 'approval-stamps', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists approval_stamps_read on storage.objects;
create policy approval_stamps_read on storage.objects
  for select to authenticated using (
    bucket_id = 'approval-stamps'
    and (select public.has_permission((select auth.uid()), 'users.manage'))
  );
drop policy if exists approval_stamps_insert on storage.objects;
create policy approval_stamps_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'approval-stamps'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/stamp-[0-9]+\.(png|jpg|jpeg|webp)$'
    and (select public.has_permission((select auth.uid()), 'users.manage'))
  );
drop policy if exists approval_stamps_delete on storage.objects;
create policy approval_stamps_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'approval-stamps'
    and (select public.has_permission((select auth.uid()), 'users.manage'))
  );
