-- M2 P-B #20 — anon 사업자번호 조회 RPC. D5: 전체노출(연락처 포함). 노출필드 화이트리스트(A5).
-- 장비명은 equipment_public(active만) 경유 → inactive 카탈로그명 누출 차단.
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
