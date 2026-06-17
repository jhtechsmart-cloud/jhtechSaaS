alter table public.equipment drop constraint if exists equipment_catalog_pdf_path;
alter table public.equipment drop column if exists catalog_pdf;
drop policy if exists equipment_catalogs_read on storage.objects;
drop policy if exists equipment_catalogs_insert on storage.objects;
drop policy if exists equipment_catalogs_update on storage.objects;
drop policy if exists equipment_catalogs_delete on storage.objects;
delete from storage.buckets where id = 'equipment-catalogs';
