-- M2 — equipment.category(자유텍스트) → category_id(equipment_category FK) 전환.
-- 기존 distinct category 텍스트를 대분류 노드로 보존 생성 후 매핑. 구조 정리는 admin.
-- 공개뷰는 분류명 조인으로 category(이름) 노출 유지(anon 카탈로그 호환).

alter table public.equipment add column category_id uuid references public.equipment_category (id) on delete restrict;
create index equipment_category_id_idx on public.equipment (category_id);

-- 1) 기존 distinct non-null category → 대분류 노드 보존 생성(중복 안전)
-- ⚠️ 정규화는 btrim만 — 오타·내부공백·전각 변형은 별개 대분류 노드로 보존된다(데이터 손실 없음).
--    동일 의도 분류의 중복 노드는 admin에서 병합(T5). on conflict do nothing 멱등(부분 UNIQUE arbiter).
insert into public.equipment_category (name)
select distinct btrim(category) from public.equipment
where nullif(btrim(category), '') is not null
on conflict do nothing;

-- 2) equipment.category_id 매핑(대분류 노드와 이름 일치)
-- 최초 적용 시 소분류가 없으므로 대분류 노드와 이름 매칭. (재적용 시 동명 소분류가 있으면 매핑 누락 가능)
update public.equipment e
set category_id = ec.id
from public.equipment_category ec
where ec.parent_id is null and ec.name = btrim(e.category)
  and nullif(btrim(e.category), '') is not null;

-- 3) 공개뷰 재생성: category 텍스트 컬럼 의존 제거 → 조인 분류명 노출
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select e.id, e.name, e.model, ec.name as category, e.photos, e.highlights, e.specs, e.youtube_urls, e.created_at
  from public.equipment e
  left join public.equipment_category ec on ec.id = e.category_id
  where e.status = 'active';
grant select on public.equipment_public to anon, authenticated;

-- 4) 원본 category 텍스트 컬럼 제거
alter table public.equipment drop column category;
