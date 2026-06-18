-- 롤백: 의뢰 상태 라이프사이클 확장 되돌리기.
-- ⚠️ 신규 3상태 행이 남아 있으면 CHECK 복원이 실패하므로, 먼저 종료(closed)로 되돌린 뒤 제약을 좁힌다.
update public.applications
  set status = 'closed'
  where status in ('delivered', 'collecting', 'collected');

alter table public.applications drop constraint applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('new', 'assigned', 'quoted', 'quote_sent', 'closed'));
