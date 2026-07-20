-- 롤백 — 발행 리포트 catalog_equipment_id 백필 되돌리기 (#242)
-- 앞 마이그레이션(20260720170000)의 롤백이 컬럼 자체를 DROP 하므로 보통은 이 파일이 불필요하다.
-- 컬럼은 유지한 채 백필만 되돌릴 때 사용한다.
do $$
begin
  alter table public.service_reports disable trigger service_reports_bu;
  update public.service_reports set catalog_equipment_id = null where status = 'issued';
  alter table public.service_reports enable trigger service_reports_bu;
exception
  when others then
    alter table public.service_reports enable trigger service_reports_bu;
    raise;
end $$;
