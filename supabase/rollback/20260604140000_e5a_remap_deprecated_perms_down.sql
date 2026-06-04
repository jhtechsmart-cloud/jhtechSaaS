-- E5a #38 step6 롤백 — remap 헬퍼 함수 제거.
-- ⚠️ 데이터 remap(profiles.permissions)은 자동 역변환하지 않는다: 원래 edit/view_all/status를
--    이미 갖고 있던 계정과 remap으로 추가된 계정을 구분할 수 없어 역변환이 데이터를 손상시킨다.
--    (운영 데이터상 .manage 보유 계정은 0건일 가능성이 높다 — admin=users.manage super.)
--    되돌릴 필요가 생기면 관리 UI(/admin/users) 또는 seed 재실행으로 권한을 복원한다.
--    registry의 .manage 3키 재추가는 코드 revert(PR)로 처리.

drop function if exists public.remap_deprecated_perms(text[]);
