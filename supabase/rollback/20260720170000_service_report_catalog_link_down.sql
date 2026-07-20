-- 롤백 — AS 히스토리 Part 1a (#242)
-- 적용 역순: ⑤RPC 복원 → ④컬럼 제거 → ③소급 연결 원복 → ②백업 테이블 제거 → ①match 함수 제거
--
-- ⚠️ RPC 복원은 20260716170100_service_reports_rpc.sql의 정의를 그대로 다시 실행해야 한다.
--    이 파일은 그 재실행을 안내만 하고, 데이터 원복만 수행한다.
--    복원 명령: psql -f supabase/migrations/20260716170100_service_reports_rpc.sql
--    (create or replace 이므로 재실행이 곧 복원. 단 이후 마이그레이션이 같은 함수를 또 바꿨다면
--     그 최신 정의를 써야 한다 — 반드시 적용 이력을 확인할 것.)

-- ③ 소급 연결 원복 — 백업 스냅샷 기준(문자열 파싱 의존 없음).
--    백업이 유실된 행은 카탈로그 이름으로 폴백해 label을 채운다(XOR 제약 위반으로 롤백이
--    통째로 실패하는 일이 없도록 — 롤백이 실패하는 롤백 계획은 롤백 계획이 아니다).
update public.company_equipment ce
   set equipment_id = null,
       label = b.old_label,
       updated_at = now()
  from public.company_equipment_link_backup b
 where ce.id = b.company_equipment_id
   and ce.equipment_id is not null;

-- 백업에 없는데 이 마이그레이션 시점 이후 연결된 행이 있다면(확정 RPC가 만든 신규 행 등)
-- label이 null이라 컬럼 제거 시 XOR을 위반한다 → 카탈로그 이름으로 폴백.
update public.company_equipment ce
   set label = coalesce(nullif(btrim(coalesce(ce.note, '')), ''), e.name),
       equipment_id = null,
       updated_at = now()
  from public.equipment e
 where ce.equipment_id = e.id
   and not exists (select 1 from public.company_equipment_link_backup b
                    where b.company_equipment_id = ce.id);

-- ④ 컬럼·인덱스 제거
drop index if exists public.service_reports_catalog_equipment_idx;
alter table public.service_reports drop column if exists catalog_equipment_id;

-- ② 백업 테이블 제거
drop table if exists public.company_equipment_link_backup;

-- ① match 함수 제거
drop function if exists public.match_catalog_equipment(text);
