-- 주의: category 텍스트 원복은 category_id→이름 역매핑으로 best-effort.
alter table public.equipment add column category text;
update public.equipment e set category = ec.name
  from public.equipment_category ec where ec.id = e.category_id;
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, highlights, specs, youtube_urls, created_at
  from public.equipment where status = 'active';
grant select on public.equipment_public to anon, authenticated;
drop index if exists public.equipment_category_id_idx;
alter table public.equipment drop column category_id;
