-- 발송 기록에 '실제 미발송(테스트 모드)' 표시 추가(구현현황비고 #1).
--
-- 왜: 워커에 HIWORKS_OFFICE_TOKEN이 없으면 FakeMailSender(실제 발송 안 함)가 쓰이는데도
-- email_log.status가 'sent'로 남아, 화면에 "발송됨"으로 보였다(고객은 메일을 못 받음).
-- 변경: status 상태기계(pending→sending→sent/failed)·중복 방지 부분 유니크 인덱스는 그대로 두고,
-- 워커가 가짜 발송기로 처리했을 때 simulated=true를 함께 기록한다. 화면은 sent+simulated를 "미발송(테스트 모드)"로 표시.
alter table public.email_log
  add column simulated boolean not null default false;

comment on column public.email_log.simulated is
  'true = 워커가 FakeMailSender(하이웍스 토큰 미설정)로 처리 — status=sent여도 실제 메일은 나가지 않았다.';
