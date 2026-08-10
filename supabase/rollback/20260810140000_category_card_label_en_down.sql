-- 롤백: 카드 영문 라벨 컬럼 제거 + fields_changed를 20260810120000 정의로 복원
alter table public.equipment_category drop column if exists card_label_en;

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
