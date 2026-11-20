-- 20261120100200_release_order_seq_no_overflow 되돌리기 — release_orders_before_insert를 20260626160000 정의(lpad 5자리)로 복원.
create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_existing text;
begin
  select seq_no into v_existing from public.release_orders
    where application_id = new.application_id
    order by version limit 1;
  if v_existing is not null then
    new.seq_no := v_existing; -- 버전 간 출고번호 공유
  else
    new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
      || '-' || lpad(nextval('public.release_order_seq')::text, 5, '0');
  end if;
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;
