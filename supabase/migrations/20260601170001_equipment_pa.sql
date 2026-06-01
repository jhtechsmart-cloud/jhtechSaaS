-- M2 P-A — equipment: highlights·youtube_urls 추가, specs 그룹구조 전환, 공개뷰 재생성.

alter table public.equipment
  add column highlights text[] not null default '{}',
  add column youtube_urls text[] not null default '{}';

-- youtube_url 단일 → 배열 백필
update public.equipment set youtube_urls = array[youtube_url] where youtube_url is not null;

-- specs 평면 [{label,value}] → [{group:'',icon:'settings',items:[...]}]
update public.equipment set specs =
  jsonb_build_array(jsonb_build_object('group', '', 'icon', 'settings', 'items', specs))
  where jsonb_typeof(specs) = 'array'
    and jsonb_array_length(specs) > 0
    and (specs->0) ? 'label';

-- 공개뷰가 youtube_url 의존 → drop + recreate 후 컬럼 drop
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, highlights, specs, youtube_urls, created_at
  from public.equipment
  where status = 'active';
grant select on public.equipment_public to anon, authenticated;

alter table public.equipment drop column youtube_url;
