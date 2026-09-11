-- 롤백 #285 #C 직인 보호 — 20260909170003(정책)·20260909170000(CHECK) 원문으로 복원.

drop policy if exists approval_stamps_delete on storage.objects;
create policy approval_stamps_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'approval-stamps'
    and (select public.has_permission((select auth.uid()), 'users.manage'))
  );

alter table public.profiles drop constraint if exists profiles_approval_stamp_path_check;
alter table public.profiles
  add constraint profiles_approval_stamp_path_check
  check (approval_stamp_path is null
         or approval_stamp_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/stamp-[0-9]+\.(png|jpg|jpeg|webp)$');
