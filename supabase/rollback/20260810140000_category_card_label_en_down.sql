-- 롤백: 카드 영문 라벨 컬럼 제거
alter table public.equipment_category drop column if exists card_label_en;
