-- 롤백: avatars 버킷 정책·버킷·profiles.avatar_url 제거.
drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
delete from storage.buckets where id = 'avatars';
alter table public.profiles drop column if exists avatar_url;
