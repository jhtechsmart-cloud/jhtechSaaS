-- E1 Foundation #3 — equipment / equipment_option + 공개 뷰 + RLS
-- youtube_url: D5 공개 장비 상세 페이지용. equipment_public: 가격·옵션 비노출 공개 뷰.

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text,
  category text,
  base_price numeric(14, 2) not null default 0,
  photos text[] not null default '{}',
  specs jsonb not null default '{}',
  youtube_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index on public.equipment (status);

create table public.equipment_option (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  kind text not null check (kind in ('included', 'extra')),
  name text not null,
  price numeric(14, 2) not null default 0
);
create index on public.equipment_option (equipment_id);

-- D5: 공개 뷰 — definer 권한(postgres 소유)으로 RLS 우회, active만, 가격·옵션 컬럼 제외.
-- security_barrier로 술어 누수 방지. anon 상세 페이지가 이 뷰만 읽는다.
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, specs, youtube_url, created_at
  from public.equipment
  where status = 'active';
grant select on public.equipment_public to anon, authenticated;

-- equipment RLS: 로그인 스태프 전원 읽기, 쓰기는 equipment.manage. anon 정책 없음(원본 비공개).
alter table public.equipment enable row level security;

create policy equipment_select on public.equipment
  for select to authenticated using (true);

create policy equipment_insert on public.equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));

create policy equipment_update on public.equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));

create policy equipment_delete on public.equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));

-- equipment_option RLS: 로그인 스태프 읽기, 쓰기는 equipment.manage.
alter table public.equipment_option enable row level security;

create policy equipment_option_select on public.equipment_option
  for select to authenticated using (true);

create policy equipment_option_insert on public.equipment_option
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));

create policy equipment_option_update on public.equipment_option
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));

create policy equipment_option_delete on public.equipment_option
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));
