-- 납품 일정 — 발행(issued) 후 입력하는 운영값. 견적 내용이 아니므로 발행본 동결 대상이 아니다
-- (quotes_enforce_server_fields 트리거는 명시 컬럼만 검사 → 별도 예외 코드 불필요, db-test로 고정).
-- 대시보드 2주 캘린더·데모예약 월캘린더의 '납품' 이벤트 소스로 쓰인다.

alter table public.quotes
  add column delivery_date date,
  add column delivery_time time;

comment on column public.quotes.delivery_date is '납품 예정일(발행 후 입력, NULL=미정)';
comment on column public.quotes.delivery_time is '납품 예정 시각(선택, NULL=시간 미정)';
