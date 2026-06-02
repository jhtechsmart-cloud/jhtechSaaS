-- M2 P-C #21 — consumable_scope(매핑). category_id XOR equipment_id = 정확히 하나.
-- category_id = equipment_category 노드(대분류=공통 / 소분류). consumable 삭제 시 cascade.
-- 분류·장비 삭제는 restrict(매핑 보호). id 보존 diff-upsert.
create table public.consumable_scope (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.consumables (id) on delete cascade,
  category_id uuid references public.equipment_category (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- category_id 또는 equipment_id 중 정확히 하나만 지정
  constraint consumable_scope_identity
    check ((category_id is not null) <> (equipment_id is not null))
);

-- 부분 UNIQUE: 같은 소모품·장비 조합 중복 방지
create unique index consumable_scope_uniq_equipment
  on public.consumable_scope (consumable_id, equipment_id) where equipment_id is not null;
-- 부분 UNIQUE: 같은 소모품·분류 조합 중복 방지
create unique index consumable_scope_uniq_category
  on public.consumable_scope (consumable_id, category_id) where category_id is not null;

-- 조회 성능용 인덱스
create index consumable_scope_consumable_idx on public.consumable_scope (consumable_id);
create index consumable_scope_equipment_idx on public.consumable_scope (equipment_id);
create index consumable_scope_category_idx on public.consumable_scope (category_id);

-- created_at·updated_at 서버 강제 트리거 (클라이언트 조작 불가)
create or replace function public.consumable_scope_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger consumable_scope_server_fields
  before insert or update on public.consumable_scope
  for each row execute function public.consumable_scope_enforce_server_fields();

-- RLS 활성화
alter table public.consumable_scope enable row level security;

-- SELECT: 인증 사용자 전체 조회 허용 (anon 차단)
create policy consumable_scope_select on public.consumable_scope for select to authenticated using (true);

-- INSERT: consumables.manage 권한 보유자만
create policy consumable_scope_insert on public.consumable_scope for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));

-- UPDATE: consumables.manage 권한 보유자만
create policy consumable_scope_update on public.consumable_scope for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));

-- DELETE: consumables.manage 권한 보유자만
create policy consumable_scope_delete on public.consumable_scope for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
