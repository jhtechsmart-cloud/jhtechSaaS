-- 장비옵션 표시 순서 고정 — 과거 order by id(랜덤 UUID)로 저장마다 순서가 뒤바뀌던 문제 해소.
-- 저장 시 폼 순서(index)를 sort_order에 기록하고, 로드는 sort_order로 정렬해 작성 순서를 유지한다.

alter table public.equipment_option
  add column if not exists sort_order integer not null default 0;

-- 기존 행 backfill: equipment별 물리(ctid) 순서 = 마지막 저장의 삽입 순서 ≈ 작성 순서.
with ranked as (
  select id, row_number() over (partition by equipment_id order by ctid) - 1 as rn
  from public.equipment_option
)
update public.equipment_option o
set sort_order = ranked.rn
from ranked
where ranked.id = o.id;

create index if not exists equipment_option_sort_idx
  on public.equipment_option (equipment_id, sort_order);
