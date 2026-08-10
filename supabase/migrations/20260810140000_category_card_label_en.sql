-- 홈페이지 '전체 제품' 카드 대표 이미지의 좌측 세로 밴드 영문 텍스트(예: ROLL TO ROLL UV PRINTER).
-- 분류 단위로 관리자가 입력 — 장비 카드 합성 시 소분류 → 조상 폴백으로 해석(wp_category_id와 동일 규칙).
alter table public.equipment_category
  add column card_label_en text
  constraint equipment_category_card_label_en_len
    check (card_label_en is null or char_length(card_label_en) between 1 and 60);

-- 카드 대표 이미지가 quote_device_name(모델명 로고)도 소재로 쓰므로 dirty 감지에 포함
-- (교체 후 [홈페이지 갱신] 유도 — quote_device_image와 동일 사유).
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
    or p_new.quote_device_image is distinct from p_old.quote_device_image
    or p_new.quote_device_name is distinct from p_old.quote_device_name;
$$;
