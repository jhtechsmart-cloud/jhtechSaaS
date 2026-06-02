-- 롤백: P-D customer-uploads A/S 슬롯 (#22)
drop policy if exists "customer_uploads_insert_anon_as" on storage.objects;
drop policy if exists "customer_uploads_read_staff_as" on storage.objects;
