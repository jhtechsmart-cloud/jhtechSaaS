-- M2 P-D #22 — customer-uploads 버킷에 A/S 사진 슬롯(as_photo_1..3) 추가 + service_requests.view_all read.
-- additive: 기존 견적 슬롯 정책은 그대로 두고 새 정책을 OR로 추가(회귀 0). RPC photos 정규식과 동일집합.
create policy "customer_uploads_insert_anon_as" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'customer-uploads'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(as_photo_1|as_photo_2|as_photo_3)\.(jpg|png|webp)$'
  );

-- A/S 스태프(service_requests.view_all): 고객 업로드 사진 읽기(기존 applications.view_all read와 OR).
create policy "customer_uploads_read_staff_as" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
  );
