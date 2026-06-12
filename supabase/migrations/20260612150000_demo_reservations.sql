-- 데모센터 예약 — 센터 1곳: 취소 외 예약끼리 시간대 겹침을 DB가 원천 차단(EXCLUDE).
-- UI/서버 검증은 편의 장치일 뿐, 동시 INSERT 레이스에서도 이 제약이 한쪽을 23P01로 실패시킨다.
-- 서버 액션이 23P01을 "방금 다른 예약이 등록되었습니다…" 한국어 메시지로 변환한다.

create extension if not exists btree_gist;

create table public.demo_reservations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies (id),   -- NULL = 미등록 고객(이름만 보관)
  customer_name text not null,                            -- 비정규화 표시용(고객 마스터 변경과 무관한 스냅샷)
  equipment_id  uuid not null references public.equipment (id),
  visitor_name  text,
  visitor_phone text,
  time_range    tstzrange not null,                       -- 시작~종료, 반개구간 [start,end)
  memo          text,
  status        text not null default 'confirmed'
                check (status in ('confirmed','canceled','done')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  -- 중복 예약 원천 차단: 취소되지 않은 예약끼리 시간대 겹침 금지
  constraint demo_reservations_no_overlap
    exclude using gist (time_range with &&) where (status <> 'canceled'),
  -- 15분 단위 검증(KST=UTC+9 정시 오프셋이라 분 추출은 타임존 무관)
  constraint demo_reservations_quarter_hour check (
    extract(minute from lower(time_range))::int % 15 = 0
    and extract(minute from upper(time_range))::int % 15 = 0
  ),
  -- 빈/무한 범위 차단(시작=종료, 무경계 입력 방지)
  constraint demo_reservations_range_sane check (
    not isempty(time_range) and not lower_inf(time_range) and not upper_inf(time_range)
  ),
  constraint demo_reservations_customer_name_len check (char_length(customer_name) <= 200),
  constraint demo_reservations_visitor_name_len check (char_length(coalesce(visitor_name,'')) <= 80),
  constraint demo_reservations_visitor_phone_len check (char_length(coalesce(visitor_phone,'')) <= 32),
  constraint demo_reservations_memo_len check (char_length(coalesce(memo,'')) <= 2000)
);

-- 일자별 조회(time_range && 하루범위)용 — EXCLUDE 인덱스는 status 부분 인덱스라 별도 전체 인덱스 유지.
create index demo_reservations_time_range_gist
  on public.demo_reservations using gist (time_range);

-- 서버 통제값 강제 — 컬럼 GRANT REVOKE는 테이블 GRANT가 있으면 무효 → BEFORE 트리거가 정석 [E1].
create or replace function public.demo_reservations_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    -- 클라가 보낸 created_by는 무시하고 호출자 본인으로. service_role(auth.uid() NULL)은 지정값 유지.
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger demo_reservations_server_fields
  before insert or update on public.demo_reservations
  for each row execute function public.demo_reservations_enforce_server_fields();

alter table public.demo_reservations enable row level security;

-- 조회 = 전 직원(콘솔 접근자 누구나 일정 확인), 쓰기 = demo_reservations.write(영업 프리셋 포함),
-- 삭제 = 관리자만(이력 보존 — 일반 취소는 status='canceled' UPDATE).
create policy demo_reservations_select on public.demo_reservations
  for select to authenticated using (true);

create policy demo_reservations_insert on public.demo_reservations
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));

create policy demo_reservations_update on public.demo_reservations
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'demo_reservations.write')))
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));

create policy demo_reservations_delete on public.demo_reservations
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
