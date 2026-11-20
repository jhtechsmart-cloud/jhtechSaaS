-- 출고번호 일련번호 5자리 잘림 수정(구현현황비고 #84).
--
-- 왜: lpad(값, 5, '0')는 값이 5자리를 넘으면 앞 5자리로 **잘라낸다**(100000 → '10000').
-- 전역 시퀀스가 10만에 도달하면 이미 쓴 번호와 같은 출고번호가 만들어진다.
-- 변경: 다른 채번(next_service_request_seq_no 등)과 같은 비잘림 규칙 — 10만 이상이면 숫자 그대로.
-- 나머지 동작(버전 간 출고번호 공유, created_at·created_by 서버 강제)은 20260626160000 정의 그대로.
create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_existing text;
  v bigint;
begin
  select seq_no into v_existing from public.release_orders
    where application_id = new.application_id
    order by version limit 1;
  if v_existing is not null then
    new.seq_no := v_existing; -- 버전 간 출고번호 공유
  else
    v := nextval('public.release_order_seq');
    new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
      || '-' || case when v >= 100000 then v::text else lpad(v::text, 5, '0') end;
  end if;
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;
