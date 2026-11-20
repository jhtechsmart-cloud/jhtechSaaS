-- 홈페이지 미반영 감지에 quote_device_name(모델명 로고) 복원(구현현황비고 #83).
--
-- 왜: 20260810140000이 카드 대표 이미지 소재인 quote_device_name을 감지 대상에 넣었으나,
-- 20260813120000(wp_brand 추가)이 그보다 앞선 정의를 바탕으로 재정의하면서 이 줄이 빠졌다(회귀).
-- 결과: 모델명 로고만 바꾸면 공개 글에 '반영 대기(wp_dirty)'가 켜지지 않고, 초안·미생성 글도 자동 sync가 안 걸렸다.
-- 변경: 최신 정의(wp_brand 포함)에 quote_device_name 한 줄만 더한다.
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
    or p_new.quote_device_name is distinct from p_old.quote_device_name
    or p_new.wp_brand is distinct from p_old.wp_brand;
$$;
