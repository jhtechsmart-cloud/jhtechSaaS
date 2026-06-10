-- 견적서 PDF — 장비별 견적서 배너 2종(상·하단) + 담당자 전화.
-- 배너 경로는 equipment-images 버킷 객체 경로. nullable(없으면 PDF에서 생략).

alter table public.equipment
  add column if not exists quote_banner_top text,
  add column if not exists quote_banner_bottom text;

-- 담당자 전화(견적서 담당자 라인). nullable.
alter table public.profiles
  add column if not exists phone text;

-- 경로 형식 가드(임의경로 차단): equipment/{uuid}/banner-(top|bottom).{ext}
alter table public.equipment
  add constraint equipment_quote_banner_top_path
    check (quote_banner_top is null or quote_banner_top ~ '^equipment/[0-9a-f-]{36}/banner-top\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_banner_bottom_path
    check (quote_banner_bottom is null or quote_banner_bottom ~ '^equipment/[0-9a-f-]{36}/banner-bottom\.(jpg|jpeg|png|webp)$');
