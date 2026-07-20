-- AS 히스토리 1a 후속 — 기존 발행 리포트의 catalog_equipment_id 백필 (#242)
--
-- 왜: 앞 마이그레이션은 신규 확정분만 카탈로그를 채운다. 이미 발행된 리포트는 발행 동결
-- 트리거(old.status='issued'면 화이트리스트 외 전 컬럼 거부) 때문에 일반 UPDATE로 못 채운다.
-- 그런데 catalog_equipment_id를 "모델 집계의 단일 원본"으로 정했으므로, 비워두면 기존 리포트가
-- 통계에서 통째로 빠진다(적용 시점 프로덕션 발행분 4건 = 전량).
--
-- 동결은 "앱·RLS 경로에서 발행본을 못 고친다"는 규약이지 마이그레이션까지 막자는 뜻은 아니다.
-- 트리거를 잠깐 끄고 채운 뒤 곧바로 되켠다. 화이트리스트에 컬럼을 추가하는 방식은 쓰지 않는다
-- (그러면 앱에서도 영구히 수정 가능해져 발행본 불변 규약이 깨진다).
--
-- 출처는 보유장비의 카탈로그 링크뿐 — 이름 재매칭은 하지 않는다. 발행 당시 기사가 확인한
-- 장비와 다른 모델로 추정 연결하면 문서와 통계가 어긋난다.

do $$
declare
  v_filled int;
begin
  alter table public.service_reports disable trigger service_reports_bu;

  update public.service_reports sr
     set catalog_equipment_id = ce.equipment_id
    from public.company_equipment ce
   where sr.company_equipment_id = ce.id
     and sr.catalog_equipment_id is null
     and ce.equipment_id is not null;
  get diagnostics v_filled = row_count;

  alter table public.service_reports enable trigger service_reports_bu;

  raise notice '[1a backfill] 발행 리포트 카탈로그 링크 채움: %건', v_filled;
exception
  when others then
    -- 실패해도 트리거는 반드시 되켠다(꺼진 채로 남으면 발행본 동결이 무력화된다)
    alter table public.service_reports enable trigger service_reports_bu;
    raise;
end $$;

-- 남은 미연결 발행분 가시화 — 조용한 누락 금지(운영 확인용).
do $$
declare
  v_left int;
begin
  select count(*) into v_left
    from public.service_reports
   where status = 'issued' and catalog_equipment_id is null;
  if v_left > 0 then
    raise notice '[1a backfill] 미연결 발행 리포트 %건 남음 — 보유장비가 카탈로그에 연결되지 않은 건', v_left;
  end if;
end $$;
