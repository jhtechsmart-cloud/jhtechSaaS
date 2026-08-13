-- #277 롤백 — wp_brand 컬럼 제거 + equipment_wp_fields_changed() 직전판 복원
-- (직전판 = 20260810120000_wp_dirty_quote_device_image.sql)
-- 주의: 함수가 wp_brand를 참조하는 동안 컬럼을 먼저 drop하면 함수가 깨지므로 함수 복원을 먼저 한다.

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

alter table public.equipment drop column if exists wp_brand;
