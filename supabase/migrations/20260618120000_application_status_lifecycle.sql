-- 의뢰 상태 라이프사이클 확장 — 견적발송 이후 납품·수금 단계 추가(2026-06-18 업체 미팅 요구).
-- 기존 5상태 유지(완료=closed는 화면 라벨만 '종료'로, DB 키 불변) + delivered/collecting/collected 3개 추가.
-- additive — 기존 행·전이 트리거(_quote_insert: 발행→견적발송만 자동) 무변경.
-- 납품완료→수금중→수금완료 진행은 영업 수동(StatusControl).
-- 해피패스: 접수→배정→견적중→견적발송→납품완료→수금중→수금완료. 종료=중단/종결(수동·아무때나).

alter table public.applications drop constraint applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in (
    'new', 'assigned', 'quoted', 'quote_sent',
    'delivered', 'collecting', 'collected', 'closed'
  ));
