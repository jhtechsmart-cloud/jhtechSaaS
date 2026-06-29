-- 장비 '데모 가능' 플래그.
-- 데모예약 폼은 is_demo=true 장비만 노출한다. 모든 장비가 데모 대상은 아니므로 장비별로 지정.
-- 기본값 false(기존 장비는 데모 비대상) — 관리자가 장비 편집에서 체크해 켠다.
alter table public.equipment
  add column is_demo boolean not null default false;

comment on column public.equipment.is_demo is '데모 가능 장비 여부(데모예약 폼에 노출).';
