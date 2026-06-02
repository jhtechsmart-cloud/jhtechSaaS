-- rollback: equipment_pa
alter table public.equipment add column youtube_url text;
update public.equipment set youtube_url = youtube_urls[1] where array_length(youtube_urls,1) >= 1;
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, specs, youtube_url, created_at
  from public.equipment where status = 'active';
grant select on public.equipment_public to anon, authenticated;
alter table public.equipment drop column highlights;
alter table public.equipment drop column youtube_urls;
-- 주: specs 그룹→평면 역변환은 데이터 손실 가능(그룹명·아이콘 폐기). 필요 시 수동.
