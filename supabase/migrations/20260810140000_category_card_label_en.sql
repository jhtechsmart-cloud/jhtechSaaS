-- 홈페이지 '전체 제품' 카드 대표 이미지의 좌측 세로 밴드 영문 텍스트(예: ROLL TO ROLL UV PRINTER).
-- 분류 단위로 관리자가 입력 — 장비 카드 합성 시 소분류 → 조상 폴백으로 해석(wp_category_id와 동일 규칙).
alter table public.equipment_category
  add column card_label_en text
  constraint equipment_category_card_label_en_len
    check (card_label_en is null or char_length(card_label_en) between 1 and 60);
