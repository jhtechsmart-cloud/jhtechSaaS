-- 견적서 장비 이미지(quote_device_image)가 WP 자동 등록 글의 사양 옆 이미지로 쓰이게 되면서
-- (#268 후속) 이 컬럼 변경도 홈페이지 반영 대상 = wp_dirty 트리거에 포함한다.
-- 미포함 시 견적 이미지 교체 후에도 dirty가 안 켜져 [홈페이지 갱신] 유도가 안 된다.
create or replace function public.equipment_wp_fields_changed(p_old public.equipment, p_new public.equipment)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_new.name is distinct from p_old.name
    or p_new.model is distinct from p_old.model
    or p_new.photos is distinct from p_old.photos
    or p_new.specs is distinct from p_old.specs
    or p_new.highlights is distinct from p_old.highlights
    or p_new.youtube_urls is distinct from p_old.youtube_urls
    or p_new.category_id is distinct from p_old.category_id
    or p_new.wp_subtitle is distinct from p_old.wp_subtitle
    or p_new.wp_series_name is distinct from p_old.wp_series_name
    or p_new.quote_device_image is distinct from p_old.quote_device_image;
$$;
