-- 데모예약 수정 — 부모 UPDATE + 자식(장비) 전체 교체 원자적. create RPC와 대칭.
-- status·created_by는 서버 통제값이라 수정 대상에서 제외(유지). 같은-장비 겹침(23P01)은 그대로 전파.
-- 자식 교체(delete-all+insert) 정당성: demo_reservation_equipment는 외부 FK·이력 참조가 없다.
create or replace function public.update_demo_reservation(
  p_id uuid,
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
  v_uid    uuid := auth.uid();
  v_status text;
  v_cnt    int;
begin
  if not public.has_permission(v_uid, 'demo_reservations.write') then
    raise exception '데모예약 수정 권한이 없습니다' using errcode = 'insufficient_privilege';
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

  -- 대상 예약 존재 + 취소 안 됨 확인. 현재 status를 자식에 동기화하려고 잠금 조회.
  select status into v_status from public.demo_reservations where id = p_id for update;
  if v_status is null then
    raise exception '예약을 찾을 수 없습니다' using errcode = 'check_violation';
  end if;
  if v_status = 'canceled' then
    raise exception '취소된 예약은 수정할 수 없습니다' using errcode = 'check_violation';
  end if;

  -- 부모 필드 수정(status·created_by는 유지).
  update public.demo_reservations set
    company_id    = p_company_id,
    customer_name = btrim(p_customer_name),
    visitor_name  = nullif(btrim(coalesce(p_visitor_name,'')),''),
    visitor_phone = nullif(btrim(coalesce(p_visitor_phone,'')),''),
    assignee_id   = p_assignee_id,
    memo          = nullif(btrim(coalesce(p_memo,'')),''),
    time_range    = p_time_range
  where id = p_id;

  -- 자식 전체 교체 — 같은 트랜잭션이라 자기 옛 장비와는 충돌 안 나고,
  -- 다른 예약과의 같은-장비 겹침은 자식 EXCLUDE가 23P01로 차단(서버 액션이 충돌 메시지로 변환).
  delete from public.demo_reservation_equipment where reservation_id = p_id;
  insert into public.demo_reservation_equipment (reservation_id, equipment_id, time_range, status)
    select p_id, x, p_time_range, v_status
    from (select distinct unnest(p_equipment_ids) as x) s;

  return p_id;
end;
$$;

-- authenticated 전용(anon 차단 — grant만으론 안 되고 revoke 필수).
revoke all on function public.update_demo_reservation(uuid,uuid,text,text,text,uuid,text,tstzrange,uuid[]) from public, anon;
grant execute on function public.update_demo_reservation(uuid,uuid,text,text,text,uuid,text,tstzrange,uuid[]) to authenticated;
