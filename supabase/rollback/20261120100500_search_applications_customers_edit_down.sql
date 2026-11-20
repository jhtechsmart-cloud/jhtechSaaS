-- 20261120100500_search_applications_customers_edit 되돌리기 — search_applications_for_customer를 20260604120000 정의(customers.view_all 전용)로 복원.
create or replace function public.search_applications_for_customer(p_query text)
returns table (id uuid, seq_no text, company text, biz_no text, ceo text, phone text, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_like text;
begin
  if not public.has_permission((select auth.uid()), 'customers.view_all') then
    raise exception 'permission denied: customers.view_all required' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 200 then return; end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select a.id, a.seq_no, a.company, a.biz_no, a.ceo, a.phone, a.email, a.created_at
    from public.applications a
    where a.company ilike '%' || v_like || '%' escape '\'
       or a.seq_no ilike '%' || v_like || '%' escape '\'
       or (char_length(v_digits) >= 3 and a.biz_no ilike '%' || v_digits || '%')
    order by a.created_at desc
    limit 20;
end;
$$;
revoke all on function public.search_applications_for_customer(text) from public;
grant execute on function public.search_applications_for_customer(text) to authenticated;
