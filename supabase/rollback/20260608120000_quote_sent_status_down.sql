-- 롤백: 20260608120000_quote_sent_status.sql
-- quote_sent → quoted로 되돌리고(CHECK 복원 위해), CHECK 4상태 복원, _quote_insert 전이 제거.
update public.applications set status = 'quoted' where status = 'quote_sent';

alter table public.applications drop constraint applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('new', 'assigned', 'quoted', 'closed'));

-- _quote_insert를 상태 자동 전이 없는 버전(20260607130000)으로 복원.
create or replace function public._quote_insert(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text
)
returns public.quotes
language plpgsql
set search_path = ''
as $$
declare
  v_supply numeric(14, 2);
  v_tax numeric(14, 2);
  v_assignee uuid;
  v_row public.quotes;
begin
  perform public._quote_validate_lines(p_items);
  perform public._quote_validate_lines(p_options);

  v_supply := (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_items) e
  ) + (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_options) e
  );
  v_tax := round(v_supply * 0.1);

  select assignee_id into v_assignee from public.applications where id = p_application_id;

  insert into public.quotes (
    application_id, quote_no, version, items, options,
    supply_price, tax_price, total, status, assignee_id
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;
