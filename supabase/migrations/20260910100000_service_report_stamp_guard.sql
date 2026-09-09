-- #285 #C 이월(PR #287 /review) — 직인 보호 2종.
-- 1) 워커가 직인을 리포트 폴더로 복사하지 않고 approval-stamps 원본을 직접 읽어 PDF에 임베드하므로,
--    승인본(service_reports.approver_stamp_path)이 참조 중인 직인 객체는 관리자도 삭제할 수 없어야 한다
--    (지우면 승인본 PDF 재생성이 영구 실패). 교체는 새 버전 파일(stamp-<n>)을 올리고 포인터만 바꾼다.
-- 2) profiles.approval_stamp_path 경로 접두 uuid = 본인 id 강제 — 관리자가 타인 직인 경로를 자기 프로필에
--    지정해 남의 직인으로 승인하는 경로 차단(CHECK가 uuid 형식만 검사하던 구멍).

-- 1. approval-stamps DELETE 정책: 참조 중 객체 제외
drop policy if exists approval_stamps_delete on storage.objects;
create policy approval_stamps_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'approval-stamps'
    and (select public.has_permission((select auth.uid()), 'users.manage'))
    and not exists (
      select 1 from public.service_reports r where r.approver_stamp_path = storage.objects.name
    )
  );

-- 2. profiles.approval_stamp_path CHECK: '<본인 id>/stamp-<n>.<ext>'
alter table public.profiles drop constraint if exists profiles_approval_stamp_path_check;
alter table public.profiles
  add constraint profiles_approval_stamp_path_check
  check (approval_stamp_path is null
         or approval_stamp_path ~ ('^' || id::text || '/stamp-[0-9]+\.(png|jpg|jpeg|webp)$'));
