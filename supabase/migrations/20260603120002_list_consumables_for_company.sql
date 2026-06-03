-- M2 P-E #23 — anon 읽기 RPC 2개.
-- list_consumables_for_company: 등록고객 보유장비 매칭 active 소모품(장비별 그룹 + 평탄 dedup union). **price 절대 미반환**.
-- last_supply_request_for_company: 직전 신청 items(consumable_id·qty) — 재주문 프리필.
-- C1 함정 회피: consumables_for_equipment의 grant는 건드리지 않고(authenticated 전용), SECURITY DEFINER owner 권한으로 내부 호출.
-- 반환은 {id,name,unit}만 추려 price를 RPC 경계에서 차단.

create or replace function public.list_consumables_for_company(p_biz_no text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_company_id uuid;
  v_groups jsonb;
  v_consumables jsonb;
  v_empty jsonb := jsonb_build_object('groups', '[]'::jsonb, 'consumables', '[]'::jsonb);
begin
  if v_biz !~ '^\d{10}$' then return v_empty; end if;
  select id into v_company_id from public.companies where biz_no = v_biz limit 1;
  if v_company_id is null then return v_empty; end if;

  -- 장비별 그룹: 보유장비(카탈로그 매핑된 것)별 매칭 active 소모품 {id,name,unit}
  select coalesce(jsonb_agg(g.grp order by g.grp->>'equipment_name'), '[]'::jsonb) into v_groups
  from (
    select jsonb_build_object(
      'equipment_id', ce.equipment_id,
      'equipment_name', ep.name,
      'consumables', coalesce((
        select jsonb_agg(jsonb_build_object('id', cn.id, 'name', cn.name, 'unit', cn.unit) order by cn.name)
        from public.consumables_for_equipment(ce.equipment_id) cn
      ), '[]'::jsonb)
    ) as grp
    from public.company_equipment ce
    left join public.equipment_public ep on ep.id = ce.equipment_id
    where ce.company_id = v_company_id and ce.equipment_id is not null
  ) g;

  -- 평탄 union dedup: 제출 검증·표시 단일소스(C2)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'unit', x.unit) order by x.name), '[]'::jsonb)
  into v_consumables
  from (
    select distinct cn.id, cn.name, cn.unit
    from public.company_equipment ce
    cross join lateral public.consumables_for_equipment(ce.equipment_id) cn
    where ce.company_id = v_company_id and ce.equipment_id is not null
  ) x;

  return jsonb_build_object('groups', v_groups, 'consumables', v_consumables);
end;
$$;
revoke all on function public.list_consumables_for_company(text) from public;
grant execute on function public.list_consumables_for_company(text) to anon, authenticated;

create or replace function public.last_supply_request_for_company(p_biz_no text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_company_id uuid;
  v_req_id uuid;
  v_items jsonb;
begin
  if v_biz !~ '^\d{10}$' then return jsonb_build_object('items', '[]'::jsonb); end if;
  select id into v_company_id from public.companies where biz_no = v_biz limit 1;
  if v_company_id is null then return jsonb_build_object('items', '[]'::jsonb); end if;
  select id into v_req_id from public.supply_requests
    where company_id = v_company_id order by created_at desc limit 1;
  if v_req_id is null then return jsonb_build_object('items', '[]'::jsonb); end if;
  -- consumable_id·qty만(가격·스냅샷명 제외). 프리필은 폼이 현재 매칭 목록과 교집합.
  select coalesce(jsonb_agg(jsonb_build_object('consumable_id', sri.consumable_id, 'qty', sri.qty)), '[]'::jsonb)
  into v_items
  from public.supply_request_items sri where sri.request_id = v_req_id;
  return jsonb_build_object('items', v_items);
end;
$$;
revoke all on function public.last_supply_request_for_company(text) from public;
grant execute on function public.last_supply_request_for_company(text) to anon, authenticated;
