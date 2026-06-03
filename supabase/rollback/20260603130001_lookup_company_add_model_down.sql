-- M2 P-E #23 롤백 — lookup_company_by_biz_no를 equipment_model 추가 이전(P-B 원본)으로 복원.
-- create or replace이므로 down = 이전 본문 재정의(equipment_model 제거).
create or replace function public.lookup_company_by_biz_no(p_biz_no text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_company public.companies%rowtype;
  v_equipment jsonb;
begin
  if v_biz !~ '^\d{10}$' then return null; end if;
  select * into v_company from public.companies where biz_no = v_biz limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ce.id,
    'equipment_id', ce.equipment_id,
    'equipment_name', ep.name,
    'label', ce.label,
    'purchased_at', ce.purchased_at,
    'install_address', ce.install_address
  ) order by ce.created_at), '[]'::jsonb)
  into v_equipment
  from public.company_equipment ce
  left join public.equipment_public ep on ep.id = ce.equipment_id
  where ce.company_id = v_company.id;
  return jsonb_build_object(
    'company_id', v_company.id,
    'name', v_company.name,
    'ceo', v_company.ceo,
    'phone', v_company.phone,
    'email', v_company.email,
    'address', v_company.address,
    'equipment', v_equipment
  );
end;
$$;
revoke all on function public.lookup_company_by_biz_no(text) from public;
grant execute on function public.lookup_company_by_biz_no(text) to anon, authenticated;
