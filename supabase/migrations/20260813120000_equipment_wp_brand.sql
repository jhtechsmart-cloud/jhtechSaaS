-- #277 장비 브랜드 필드(wp_brand) — WP 동기화 시 브랜드 카테고리 부여
-- 전체 제품 페이지(/product/)는 브랜드 카테고리(FLORA/JU/MUTOH/EFI) 기준으로 필터하는데
-- 자동 동기화가 유형 소분류+판매 제품만 달아줘 자동 등록 글이 목록에서 빠졌다.
-- 소분류(하이브리드)엔 JU·FLORA가 혼재하므로 장비 단위 필드로만 구분 가능.
-- 브랜드→WP 카테고리 번호 매핑은 코드 상수(packages/shared/src/wp-brand.ts, quote_logo_kind 동형).
-- wp_brand는 equipment_wp_guard 동결 목록(명시 열거)에 없으므로 폼 수정 가능 — 의도된 동작
-- (폼 수정 가능 wp_* = wp_publish_enabled·wp_brand 2종).

-- 1) 컬럼 + CHECK
alter table public.equipment
  add column wp_brand text
  check (wp_brand is null or wp_brand in ('flora', 'ju', 'mutoh', 'efi'));

-- 2) wp_dirty 트리거 반영 대상에 wp_brand 추가 — 누락 시 공개 글에서 브랜드만 바꿔도
--    dirty가 안 켜져 [홈페이지 갱신] 반영 경로가 막힌다.
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
    or p_new.wp_brand is distinct from p_old.wp_brand;
$$;

-- 3) 백필 — 규칙이 확실한 것만(JU*→ju, XTRA*→flora). 애매한 장비(T8Q·ER642 등)는 null 유지.
--    이 UPDATE는 equipment_wp_fields_changed엔 걸리지만 wp_publish_enabled=false 장비는
--    dirty가 서지 않고, enabled 장비(JU1600H)는 dirty가 서는 게 오히려 원하는 동작
--    ([홈페이지 갱신] 버튼으로 브랜드 카테고리 반영).
update public.equipment set wp_brand = 'ju'    where model ilike 'JU%';
update public.equipment set wp_brand = 'flora' where model ilike 'XTRA%';
