-- 역: storage 버킷 + 정책
drop policy if exists "quote_pdfs_read" on storage.objects;
drop policy if exists "equipment_images_delete" on storage.objects;
drop policy if exists "equipment_images_update" on storage.objects;
drop policy if exists "equipment_images_insert" on storage.objects;
drop policy if exists "equipment_images_read" on storage.objects;
delete from storage.objects where bucket_id in ('equipment-images','quote-pdfs');
delete from storage.buckets where id in ('equipment-images','quote-pdfs');
