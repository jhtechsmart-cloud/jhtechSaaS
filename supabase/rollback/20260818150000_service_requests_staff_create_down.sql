-- 롤백 #281 A/S 대행 접수. ⚠️ biz_no NOT NULL 복원은 null 행(직원 접수 건)이 0건일 때만 성공 —
-- 있으면 먼저 `delete from service_requests where channel <> 'web'`(또는 보정) 후 실행.
drop function if exists public.create_service_request_by_staff(jsonb);

update public.profiles
   set permissions = array_remove(permissions, 'service_requests.create')
 where 'service_requests.create' = any(permissions);

drop policy if exists "customer_uploads_insert_staff_as" on storage.objects;
drop policy if exists "customer_uploads_read_staff_as" on storage.objects;
create policy "customer_uploads_read_staff_as" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
  );

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'service_requests.claim')))
  );

create or replace function public.service_requests_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_service_request_seq_no();
    new.created_at := now();
    if new.company_id is not null then
      new.assignee_id := (select assignee_id from public.companies where id = new.company_id);
    end if;
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
    new.biz_no := old.biz_no;
    if old.status in ('done', 'canceled') and new.status is distinct from old.status then
      raise exception '종결된 A/S(%): 상태를 변경할 수 없습니다', old.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

alter table public.service_requests
  drop constraint if exists service_requests_staff_channel_check,
  drop constraint if exists service_requests_biz_no_required_for_web;
alter table public.service_requests alter column biz_no set not null;
drop index if exists public.service_requests_submission_id_unique;
drop index if exists public.service_requests_created_by_idx;
alter table public.service_requests
  drop column if exists submission_id,
  drop column if exists privacy_consent_method,
  drop column if exists created_by,
  drop column if exists channel;
