-- 롤백: equipment-images 버킷 업로드 제한 해제(무제한·전체 MIME 허용 상태로 복귀).
update storage.buckets
set
  file_size_limit = null,
  allowed_mime_types = null
where id = 'equipment-images';
