-- E1 Foundation #7 — Storage 버킷 + 정책 (D4)
-- equipment-images: public(공개 장비 상세용), 쓰기 equipment.manage.
-- quote-pdfs: private, 쓰기는 워커(service_role 우회), 읽기 quotes.write. 고객은 만료형 서명 URL(E6).

insert into storage.buckets (id, name, public)
values
  ('equipment-images', 'equipment-images', true),
  ('quote-pdfs', 'quote-pdfs', false)
on conflict (id) do nothing;

-- equipment-images: 공개 읽기.
create policy "equipment_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'equipment-images');

-- equipment-images: 쓰기(업로드·수정·삭제)는 equipment.manage.
create policy "equipment_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'equipment-images'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );

create policy "equipment_images_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'equipment-images'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  )
  with check (
    bucket_id = 'equipment-images'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );

create policy "equipment_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'equipment-images'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );

-- quote-pdfs: 스태프(quotes.write) 읽기. 쓰기는 service_role(워커)만 → INSERT/UPDATE/DELETE 정책 없음.
create policy "quote_pdfs_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-pdfs'
    and (select public.has_permission((select auth.uid()), 'quotes.write'))
  );
