-- 장비출고의뢰서 — 의뢰 1:1. 핵심 컬럼 + details jsonb. seq_no/created_at 트리거 강제, 발행본 불변.
create table public.release_orders (
  id uuid primary key default gen_random_uuid(),
  seq_no text not null,
  application_id uuid not null unique references public.applications (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  device_kind text not null check (device_kind in ('printer', 'cutter')),
  status text not null default 'draft' check (status in ('draft', 'issued')),
  company text,
  contact_phone text,
  install_address text,
  install_at timestamptz,
  device_name text,
  details jsonb not null default '{}',
  pdf_url text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  issued_at timestamptz
);
create index on public.release_orders (application_id);

-- 출고번호 전역 시퀀스 + KST 일자 채번(견적/의뢰 패턴 재사용).
create sequence if not exists public.release_order_seq;

create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
    || '-' || lpad(nextval('public.release_order_seq')::text, 5, '0');
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;
create trigger release_orders_bi before insert on public.release_orders
  for each row execute function public.release_orders_before_insert();

-- 발행본 불변 — issued 행은 pdf_url·issued_at 외 전부 동결(서버/워커도 우회 불가).
-- seq_no·created_at은 상태 무관 항상 동결. issued 후 변경 시도는 예외(되돌리기 포함).
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  if old.status = 'issued' then
    if new.application_id is distinct from old.application_id
       or new.quote_id is distinct from old.quote_id
       or new.device_kind is distinct from old.device_kind
       or new.status is distinct from old.status
       or new.company is distinct from old.company
       or new.contact_phone is distinct from old.contact_phone
       or new.install_address is distinct from old.install_address
       or new.install_at is distinct from old.install_at
       or new.device_name is distinct from old.device_name
       or new.details is distinct from old.details
       or new.created_by is distinct from old.created_by then
      raise exception '발행된 출고의뢰서는 수정할 수 없습니다(pdf_url만 갱신 가능)';
    end if;
  end if;
  return new;
end; $$;
create trigger release_orders_bu before update on public.release_orders
  for each row execute function public.release_orders_before_update();

alter table public.release_orders enable row level security;

-- SELECT: 배정 본인 또는 view_all 또는 release_orders.write.
create policy release_orders_select on public.release_orders
  for select to authenticated using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'release_orders.write'))
    or exists (
      select 1 from public.applications a
      where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
    )
  );

-- INSERT/UPDATE: release_orders.write + 행 스코프(배정 본인 또는 view_all).
create policy release_orders_insert on public.release_orders
  for insert to authenticated with check (
    (select public.has_permission((select auth.uid()), 'release_orders.write'))
    and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or exists (
        select 1 from public.applications a
        where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
      )
    )
  );
create policy release_orders_update on public.release_orders
  for update to authenticated using (
    (select public.has_permission((select auth.uid()), 'release_orders.write'))
    and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or exists (
        select 1 from public.applications a
        where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
      )
    )
  );
create policy release_orders_delete on public.release_orders
  for delete to authenticated using (
    (select public.has_permission((select auth.uid()), 'users.manage'))
  );

-- 출고의뢰서 PDF 버킷(비공개, 워커 service_role 쓰기·권한자 서명URL 읽기).
insert into storage.buckets (id, name, public) values ('release-orders', 'release-orders', false)
  on conflict (id) do nothing;
create policy release_orders_pdf_read on storage.objects
  for select to authenticated using (
    bucket_id = 'release-orders'
    and ((select public.has_permission((select auth.uid()), 'release_orders.write'))
         or (select public.has_permission((select auth.uid()), 'applications.view_all')))
  );
