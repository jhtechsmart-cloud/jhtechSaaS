-- 장비 카탈로그 PDF — 공개 버킷 + equipment.catalog_pdf 경로.
-- 견적 메일에 카탈로그 다운로드 링크로 사용(영구 공개 URL, 서명URL 아님).

-- 1. 공개 버킷(PDF 전용, 20MiB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-catalogs', 'equipment-catalogs', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- 2. 정책 — 읽기 공개, 쓰기 equipment.manage + 경로 정규식(임의 업로드 차단).
create policy equipment_catalogs_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'equipment-catalogs');
create policy equipment_catalogs_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
    and name ~ '^equipment/[0-9a-f-]{36}/catalog\.pdf$'
  );
create policy equipment_catalogs_update on storage.objects
  for update to authenticated using (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );
create policy equipment_catalogs_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );

-- 3. equipment.catalog_pdf 컬럼 + 경로 CHECK.
alter table public.equipment add column if not exists catalog_pdf text;
alter table public.equipment
  add constraint equipment_catalog_pdf_path
    check (catalog_pdf is null or catalog_pdf ~ '^equipment/[0-9a-f-]{36}/catalog\.pdf$');
