-- rollback: customer_uploads_bucket
drop policy "customer_uploads_insert_anon" on storage.objects;
drop policy "customer_uploads_read_staff" on storage.objects;
delete from storage.objects where bucket_id = 'customer-uploads';
delete from storage.buckets where id = 'customer-uploads';
