-- 재고현황 확장 — 판매확정·데모·중고 수량 + 판매확정 로그 + 확정/취소 RPC.
-- 전체재고(신규) = stock_qty + sold_confirmed. 판매확정 시 재고 -1·판매확정 +1(합 불변).
-- 데모/중고 수량은 독립 정보용(재고 자동 차감 없음). 판매확정/취소는 '최종수정' 미변경(로그로만 추적).

-- 1) 수량 컬럼 3종 추가
alter table public.equipment_inventory
  add column if not exists sold_confirmed int not null default 0 check (sold_confirmed >= 0), -- 판매확정(대수, 읽기전용)
  add column if not exists demo_qty       int not null default 0 check (demo_qty >= 0),       -- 데모장비(대수, 수기)
  add column if not exists used_qty       int not null default 0 check (used_qty >= 0);       -- 중고장비(대수, 수기)

-- 2) 서버통제 트리거 보완 — 판매확정/취소 RPC는 '최종수정'을 안 건드리도록 tx-local 플래그로 스킵.
create or replace function public.equipment_inventory_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- confirm/cancel RPC가 set_config로 켠 플래그면 updated_at/by를 옛값 그대로 유지(로그로만 추적).
  if tg_op = 'UPDATE' and coalesce(current_setting('app.skip_inv_audit', true), '') = '1' then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- 3) 판매확정/취소 로그 — actor·시각은 RPC(definer)가 기록. 직접 write 정책 없음(위조 차단).
create table if not exists public.inventory_sale_log (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  action       text not null check (action in ('confirm', 'cancel')),
  actor_id     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists inventory_sale_log_eq_idx
  on public.inventory_sale_log (equipment_id, created_at desc);

alter table public.inventory_sale_log enable row level security;

-- SELECT: authenticated 전원(재고 뷰와 동일 범위). INSERT/UPDATE/DELETE 정책 없음 = RPC(definer)만 기록.
create policy inventory_sale_log_select on public.inventory_sale_log
  for select to authenticated using (true);

-- 4) 판매확정 — 모든 콘솔 사용자(로그인 스태프). 재고>0일 때만 재고 -1·판매확정 +1 + 로그.
create or replace function public.confirm_equipment_sale(p_equipment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not exists (select 1 from public.profiles where id = (select auth.uid())) then
    raise exception 'forbidden';
  end if;
  -- '최종수정' 미변경 플래그 켜고 갱신(재고 있는 행만 — 없거나 0이면 not found).
  perform set_config('app.skip_inv_audit', '1', true);
  update public.equipment_inventory
    set stock_qty = stock_qty - 1, sold_confirmed = sold_confirmed + 1
    where equipment_id = p_equipment_id and stock_qty > 0;
  if not found then
    raise exception '재고가 없습니다';
  end if;
  insert into public.inventory_sale_log (equipment_id, action, actor_id)
    values (p_equipment_id, 'confirm', (select auth.uid()));
end;
$$;
revoke all on function public.confirm_equipment_sale(uuid) from public, anon;
grant execute on function public.confirm_equipment_sale(uuid) to authenticated;

-- 5) 판매확정 취소 — 관리자(equipment.manage)만. 판매확정>0일 때 판매확정 -1·재고 +1 + 로그.
create or replace function public.cancel_equipment_sale(p_equipment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.has_permission((select auth.uid()), 'equipment.manage')) then
    raise exception 'forbidden';
  end if;
  perform set_config('app.skip_inv_audit', '1', true);
  update public.equipment_inventory
    set sold_confirmed = sold_confirmed - 1, stock_qty = stock_qty + 1
    where equipment_id = p_equipment_id and sold_confirmed > 0;
  if not found then
    raise exception '취소할 판매확정이 없습니다';
  end if;
  insert into public.inventory_sale_log (equipment_id, action, actor_id)
    values (p_equipment_id, 'cancel', (select auth.uid()));
end;
$$;
revoke all on function public.cancel_equipment_sale(uuid) from public, anon;
grant execute on function public.cancel_equipment_sale(uuid) to authenticated;
