-- 데모예약 저장 — 부모 1행 + 자식 N행 원자적. SECURITY DEFINER가 RLS 우회하므로 권한·값 명시 검증.
-- time_range·status·created_by는 서버 강제(클라 미신뢰). EXCLUDE 위반(23P01)은 그대로 전파.
create or replace function public.create_demo_reservation(
  p_company_id uuid,
  p_customer_name text,
  p_visitor_name text,
  p_visitor_phone text,
  p_assignee_id uuid,
  p_memo text,
  p_time_range tstzrange,
  p_equipment_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_cnt int;
begin
  if not public.has_permission(v_uid, 'demo_reservations.write') then
    raise exception '데모예약 등록 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception '고객명을 입력하세요' using errcode = 'check_violation';
  end if;
  if p_equipment_ids is null or array_length(p_equipment_ids, 1) is null then
    raise exception '장비를 1개 이상 선택하세요' using errcode = 'check_violation';
  end if;
  -- 선택 장비는 모두 active + is_demo 여야 한다(폼 우회 방지). 중복 제거 후 개수 비교.
  select count(distinct id) into v_cnt from public.equipment
    where id = any (p_equipment_ids) and status = 'active' and is_demo = true;
  if v_cnt <> (select count(distinct x) from unnest(p_equipment_ids) x) then
    raise exception '데모 가능한 장비만 선택할 수 있습니다' using errcode = 'check_violation';
  end if;
  -- 담당자 지정 시 실재 프로필인지(미지정=null 허용).
  if p_assignee_id is not null and not exists (select 1 from public.profiles where id = p_assignee_id) then
    raise exception '담당자가 올바르지 않습니다' using errcode = 'check_violation';
  end if;

  insert into public.demo_reservations
    (company_id, customer_name, visitor_name, visitor_phone, assignee_id, memo, time_range, status, created_by)
  values
    (p_company_id, btrim(p_customer_name), nullif(btrim(coalesce(p_visitor_name,'')),''),
     nullif(btrim(coalesce(p_visitor_phone,'')),''), p_assignee_id,
     nullif(btrim(coalesce(p_memo,'')),''), p_time_range, 'confirmed', v_uid)
  returning id into v_id;

  -- 자식 N행(중복 제거) — EXCLUDE 위반(23P01)은 그대로 전파(서버 액션이 충돌 메시지로 변환).
  insert into public.demo_reservation_equipment (reservation_id, equipment_id, time_range, status)
    select v_id, x, p_time_range, 'confirmed'
    from (select distinct unnest(p_equipment_ids) as x) s;

  return v_id;
end;
$$;

-- authenticated 전용(anon 차단 — grant만으론 안 되고 revoke 필수).
revoke all on function public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]) from public, anon;
grant execute on function public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]) to authenticated;
