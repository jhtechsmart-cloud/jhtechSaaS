-- E5 후속 — 의뢰 상태 5단계(견적발송 추가). 접수→배정→견적중→견적발송→완료.
-- 견적 저장이 의뢰 상태를 자동 전진(draft→견적중, 발행→견적발송). 앞으로만, closed/quote_sent 보존.

-- 1. CHECK 제약에 quote_sent 추가.
alter table public.applications drop constraint applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('new', 'assigned', 'quoted', 'quote_sent', 'closed'));

-- 2. _quote_insert에 상태 자동 전이 추가(create or replace).
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

  -- 의뢰 상태 자동 전진(앞으로만). 발행=견적발송, draft=견적중. quote_sent/closed는 보존(다운그레이드·재오픈 안 함).
  if p_status = 'issued' then
    update public.applications set status = 'quote_sent'
    where id = p_application_id and status in ('new', 'assigned', 'quoted');
  else
    update public.applications set status = 'quoted'
    where id = p_application_id and status in ('new', 'assigned');
  end if;

  return v_row;
end;
$$;

-- 3. 백필 — 기존 'quoted'인데 이미 발행 견적이 있는 의뢰는 새 모델상 '견적발송'.
update public.applications a
set status = 'quote_sent'
where a.status = 'quoted'
  and exists (select 1 from public.quotes q where q.application_id = a.id and q.status = 'issued');
