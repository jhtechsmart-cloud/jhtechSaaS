-- 발행 출고의뢰서 동결 트리거 — FK SET NULL(참조 삭제)은 허용(구현현황비고 #21 + 계정 삭제 회귀).
--
-- 왜:
--  ① quote_id는 ON DELETE SET NULL인데 동결 트리거가 quote_id 변경을 막아, 발행 출고의뢰서가 가리키는
--     견적을 삭제하면 FK 연쇄 UPDATE가 예외 → 견적 삭제 전체가 실패했다.
--  ② 20260622120000(사용자 완전삭제)은 created_by가 NULL로 바뀌는 경우를 예외에서 제외했으나,
--     20260626160000·20260713130000 재정의가 그 이전 정의를 바탕으로 쓰여 이 예외가 빠졌다(회귀) →
--     발행 출고의뢰서를 만든 직원 계정은 완전 삭제가 실패했다.
-- 변경: 두 컬럼 모두 "값 → NULL"(참조 대상 삭제로 인한 FK SET NULL)만 허용하고, 다른 값으로의 변경은 계속 차단.
-- 나머지 동결 목록은 20260713130000 정의 그대로(hq_address 포함).
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.version := old.version; -- 버전 불변
  if old.status = 'issued' then
    if new.application_id is distinct from old.application_id
       or (new.quote_id is not null and new.quote_id is distinct from old.quote_id)
       or new.device_kind is distinct from old.device_kind
       or new.status is distinct from old.status
       or new.company is distinct from old.company
       or new.contact_phone is distinct from old.contact_phone
       or new.hq_address is distinct from old.hq_address
       or new.install_address is distinct from old.install_address
       or new.install_at is distinct from old.install_at
       or new.device_name is distinct from old.device_name
       or new.details is distinct from old.details
       or (new.created_by is not null and new.created_by is distinct from old.created_by) then
      raise exception '발행된 출고의뢰서 버전은 수정할 수 없습니다(새 버전으로 저장됩니다)';
    end if;
  end if;
  return new;
end; $$;
