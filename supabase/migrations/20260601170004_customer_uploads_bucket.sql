-- M2 P-A — 고객 현장 사진 업로드 버킷(private). anon INSERT만, 스태프(applications.view_all) read.
-- 고아 청소 cron은 후속(P-D 워커/jobs 큐). 여기선 버킷·정책만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-uploads', 'customer-uploads', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- anon: 현장 사진 업로드(INSERT)만 허용. 읽기 없음(private).
create policy "customer_uploads_insert_anon" on storage.objects
  for insert to anon
  with check (bucket_id = 'customer-uploads');

-- 스태프(applications.view_all): 고객 업로드 사진 읽기.
create policy "customer_uploads_read_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );
