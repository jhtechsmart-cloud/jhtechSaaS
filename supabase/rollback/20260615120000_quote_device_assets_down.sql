-- 롤백: device 컬럼 → banner 컬럼 복원(값은 복구 불가 — 폐기됨).
alter table public.equipment
  drop constraint if exists equipment_quote_device_image_path,
  drop constraint if exists equipment_quote_device_name_path;
alter table public.equipment rename column quote_device_image to quote_banner_bottom;
alter table public.equipment rename column quote_device_name to quote_banner_top;
alter table public.equipment
  add constraint equipment_quote_banner_top_path
    check (quote_banner_top is null or quote_banner_top ~ '^equipment/[0-9a-f-]{36}/banner-top\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_banner_bottom_path
    check (quote_banner_bottom is null or quote_banner_bottom ~ '^equipment/[0-9a-f-]{36}/banner-bottom\.(jpg|jpeg|png|webp)$');
