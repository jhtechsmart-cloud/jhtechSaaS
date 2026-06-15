-- 견적서 PDF 양식 재구성: 장비별 자산 = 우하단 장비이미지 + 좌하단 장비네임.
-- 기존 상/하단 "폭 전체 배너" 개념 폐기 → 컬럼을 새 의미로 rename + 경로 정규식 교체.
-- 기존 배너 값은 새 경로(device-*) 형식과 안 맞아 CHECK 위반 → null 초기화(운영 배너 폐기 합의).

-- 1) 기존 CHECK 제약 드롭(rename 전).
alter table public.equipment
  drop constraint if exists equipment_quote_banner_top_path,
  drop constraint if exists equipment_quote_banner_bottom_path;

-- 2) 컬럼 rename: banner_bottom→device_image(우하단), banner_top→device_name(좌하단).
alter table public.equipment rename column quote_banner_bottom to quote_device_image;
alter table public.equipment rename column quote_banner_top to quote_device_name;

-- 3) 기존 배너 경로 값 폐기(새 CHECK 위반 방지).
update public.equipment set quote_device_image = null, quote_device_name = null;

-- 4) 새 경로 형식 CHECK: equipment/{uuid}/device-(image|name).{ext}
alter table public.equipment
  add constraint equipment_quote_device_image_path
    check (quote_device_image is null or quote_device_image ~ '^equipment/[0-9a-f-]{36}/device-image\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_device_name_path
    check (quote_device_name is null or quote_device_name ~ '^equipment/[0-9a-f-]{36}/device-name\.(jpg|jpeg|png|webp)$');
