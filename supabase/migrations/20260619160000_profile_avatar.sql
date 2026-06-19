-- 프로필 사진(#1) — profiles.avatar_url(스토리지 경로) + 공개 avatars 버킷.
alter table public.profiles add column avatar_url text;

-- 공개 버킷(아바타는 민감정보 아님 → public 읽기, 서명URL 불필요). 2MB, 이미지 mime만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 읽기: 공개(authenticated·anon 모두). 콘솔 내 표시용.
create policy avatars_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

-- 쓰기(insert/update/delete): authenticated 본인 폴더만. 경로 = <uid>/avatar.<ext>.
-- name 정규식으로 첫 세그먼트가 본인 uid인 것만 허용(임의 경로·타인 폴더 차단).
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/')
  );
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/')
  )
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/')
  );
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/')
  );
