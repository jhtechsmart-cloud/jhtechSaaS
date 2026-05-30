-- E2 P3 — equipment-images 버킷 서버측 업로드 제한 (AC4 서버 강제).
-- 클라이언트 validateImageFile(5MB·jpg/png/webp)는 UX 편의일 뿐, 실제 강제는
-- 버킷 정책으로 한다. 사용자가 Storage API를 직접 호출해 클라 검증을 우회하고
-- 거대 파일·임의 MIME(실행파일·스크립트 SVG 등)를 올리는 것을 차단한다.
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MiB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'equipment-images';
