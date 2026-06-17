drop policy if exists release_orders_pdf_read on storage.objects;
delete from storage.buckets where id = 'release-orders';
drop table if exists public.release_orders cascade;
drop function if exists public.release_orders_before_insert() cascade;
drop function if exists public.release_orders_before_update() cascade;
drop sequence if exists public.release_order_seq;
