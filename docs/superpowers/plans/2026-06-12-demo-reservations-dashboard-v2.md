# 데모예약 신규 + 대시보드 v2 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 구문.

**한 문장 요약:** 데모센터(1곳) 예약을 DB EXCLUDE 제약(겹침 원천 차단)으로 안전하게 받는 예약 기능을 새로 만들고, 대시보드를 "현황 + 2주 일정" 중심으로 갈아엎는다.

**이게 왜 필요한지:** 데모 일정이 지금은 시스템 밖(전화·수첩)에 있어 겹침 사고 위험이 있고, 대시보드는 숫자 나열이라 "오늘·이번 주 무슨 일이 있나"가 안 보인다.

**Goal:** `/admin/demo-reservations` 예약 관리(캘린더+일정표)·등록(15분 슬롯) 페이지 + quotes 납품일 + 대시보드 v2(KPI 4장·2주 캘린더·파이프라인 세로행·단위블록 주간활동·일정 레일).

**Architecture:** DB가 최후 방어선 — `tstzrange` + `EXCLUDE USING gist` 제약으로 동시 INSERT 레이스에서도 중복 예약 불가(23P01을 서버 액션이 한국어 충돌 메시지로 변환). UI는 같은 검증을 미리 보여주는 편의 장치일 뿐. 대시보드 집계는 기존 패턴(서버 컴포넌트 + `Promise.allSettled` 병렬 쿼리, RLS가 역할 스코프 자동 적용)을 따른다.

**Tech Stack:** Supabase(Postgres btree_gist·RLS capability 패턴) · Next.js 16 App Router · shadcn/ui · TanStack Query(필요한 곳만) · RHF+zod · Vitest · pg db-tests · Playwright.

**스펙 대비 확정 조정(코드 실측 근거):**
- `customers(id)` → 실제 테이블 `companies(id)`, `users(id)` → `profiles(id)`.
- 라우트는 admin 셸 안 `/admin/demo-reservations`(사이드바·권한 가드 일관성).
- "수주 확정 상태" 부재 → 납품일 입력 활성 조건 = 견적 `issued`(발행). 동결 트리거는 명시 컬럼만 검사하므로 delivery 컬럼은 트리거 수정 없이 갱신 가능(실측).
- 시안 HTML 부재(5회째) → 스펙 텍스트 + DESIGN.md 토큰만으로 구현(합의된 패턴).
- 영업 role 분기 = RLS 스코프(본인 배정+미배정)를 그대로 신뢰 — 기존 "내 현황" 의미와 동일.

**PR 분할:** PR-A = Phase 1+2(데모예약 스키마+페이지+납품일), PR-B = Phase 3(대시보드 v2). 각각 게이트 전체 통과 후 머지.

---

## 파일 구조

**PR-A (데모예약)**
- Create: `supabase/migrations/20260612150000_demo_reservations.sql` + `supabase/rollback/20260612150000_demo_reservations_down.sql`
- Create: `supabase/migrations/20260612150001_quotes_delivery.sql` + rollback
- Modify: `packages/shared/src/permissions.ts`(+`demo_reservations.write`, 그룹 "데모예약", SALES_PRESET 추가) + `permissions.test.ts`
- Create: `apps/web/src/lib/demo-reservations/constants.ts`(운영시간 09–18, 15분, 30/60/90/120)
- Create: `apps/web/src/lib/demo-reservations/slots.ts` + `slots.test.ts`(순수 슬롯/충돌 로직 TDD)
- Create: `apps/web/src/lib/demo-reservations/queries.ts`(일자별·월별 dot·다가오는 예약)
- Create: `apps/web/src/lib/demo-reservations/actions.ts`(create/cancel 서버 액션, 23P01 변환)
- Create: `apps/web/src/app/admin/demo-reservations/page.tsx`(캘린더+일정표)
- Create: `apps/web/src/app/admin/demo-reservations/new/page.tsx`(등록 폼)
- Create: `apps/web/src/app/admin/demo-reservations/_components/{DemoMonthCalendar,DayTimeline,ReservationDetailDialog,NewReservationForm,TimeSlotPicker,DaySummaryPanel}.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`(사이드바 데모예약 메뉴, 소모품신청 아래) + `_components/Icon.tsx`(calendarCheck 아이콘)
- Modify: 견적 상세 `quote-frame/QuoteSummaryPanel.tsx`(또는 인접) — 납품일 입력(issued만 활성) + `apps/web/src/lib/quotes/actions.ts`류에 setQuoteDelivery 액션
- Create: `packages/db-tests/src/demo-reservations.test.ts`(RLS·EXCLUDE 동시성·15분 제약)
- Create: `apps/web/e2e/demo-reservations.spec.ts`

**PR-B (대시보드 v2)**
- Create: `apps/web/src/lib/format/schedule.ts` + test(`M/D (요일)`·`HH:mm`·상대시간 공용)
- Create: `apps/web/src/lib/dashboard/v2-queries.ts`(KPI·2주 이벤트 union·파이프라인·주간활동·다가오는 일정)
- Create: `apps/web/src/lib/dashboard/v2-logic.ts` + test(이벤트 그룹핑·가동률·주간 단위블록 빌드 등 순수 로직)
- Rewrite: `apps/web/src/app/admin/dashboard/page.tsx`
- Create: `dashboard/_components/{KpiCards,TwoWeekCalendar,PipelineRows,WeeklyUnitChart,ScheduleCard,DashboardRightRail,RecentActivity}.tsx`
- Modify: `apps/web/src/app/admin/_components/ConsoleMain.tsx`(max-w 1320→1180)
- Modify: `apps/web/e2e/dashboard.spec.ts`(있으면 갱신, 없으면 생성)

---

## PR-A — Task 1: demo_reservations 마이그레이션 + db-tests

- [ ] **1-1. db-test 먼저 작성** `packages/db-tests/src/demo-reservations.test.ts`
  - admin이 INSERT 성공 / sales(`demo_reservations.write` 프리셋) INSERT 성공 / write 키 없는 계정 INSERT 거부
  - 전 직원(키 없는 authenticated) SELECT 가능
  - **겹침 INSERT 직렬 거부**: 14:00–15:30 존재 상태에서 13:00–14:30 INSERT → SQLSTATE 23P01
  - **동시성**: 같은 시간대 INSERT 2건 `Promise.allSettled` 병렬 → 정확히 1건 성공·1건 23P01
  - canceled 상태와는 겹침 허용
  - 15분 단위 아님(10:07) → check_violation
  - created_at/created_by 클라 지정 무시(BEFORE 트리거 강제)
- [ ] **1-2. 마이그레이션 작성** (스펙 SQL을 실제 테이블명으로 조정)

```sql
-- 데모센터 예약 — 센터 1곳: 취소 외 예약끼리 시간대 겹침을 DB가 원천 차단(EXCLUDE).
create extension if not exists btree_gist;

create table public.demo_reservations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies (id),   -- NULL = 미등록 고객
  customer_name text not null,                            -- 비정규화 표시용
  equipment_id  uuid not null references public.equipment (id),
  visitor_name  text,
  visitor_phone text,
  time_range    tstzrange not null,
  memo          text,
  status        text not null default 'confirmed'
                check (status in ('confirmed','canceled','done')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  constraint demo_reservations_no_overlap
    exclude using gist (time_range with &&) where (status <> 'canceled'),
  constraint demo_reservations_quarter_hour check (
    extract(minute from lower(time_range))::int % 15 = 0
    and extract(minute from upper(time_range))::int % 15 = 0
  ),
  constraint demo_reservations_range_sane check (
    not isempty(time_range) and not lower_inf(time_range) and not upper_inf(time_range)
  ),
  constraint demo_reservations_customer_name_len check (char_length(customer_name) <= 200),
  constraint demo_reservations_visitor_name_len check (char_length(coalesce(visitor_name,'')) <= 80),
  constraint demo_reservations_visitor_phone_len check (char_length(coalesce(visitor_phone,'')) <= 32),
  constraint demo_reservations_memo_len check (char_length(coalesce(memo,'')) <= 2000)
);
create index demo_reservations_time_range_gist on public.demo_reservations using gist (time_range);

-- 서버 통제값 강제(컬럼 GRANT는 무력 — BEFORE 트리거가 정석 [E1])
create or replace function public.demo_reservations_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end; $$;
create trigger demo_reservations_server_fields
  before insert or update on public.demo_reservations
  for each row execute function public.demo_reservations_enforce_server_fields();

alter table public.demo_reservations enable row level security;
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
```

  롤백: `drop table public.demo_reservations; drop function public.demo_reservations_enforce_server_fields();` (btree_gist는 남겨둠 — 다른 객체 영향 회피 주석)
- [ ] **1-3.** `supabase db reset` → db-tests 실행 GREEN → 커밋 `feat: 데모예약 테이블 — EXCLUDE 겹침 차단 + capability RLS`

## PR-A — Task 2: 권한키 등록

- [ ] **2-1.** `permissions.test.ts`에 `demo_reservations.write` 존재·SALES_PRESET 포함 단언 추가(RED)
- [ ] **2-2.** `permissions.ts`: PermissionGroup에 `"데모예약"` 추가, registry에 `{ key:"demo_reservations.write", label:"데모예약 등록·수정", description:"데모센터 예약 등록·수정·취소", group:"데모예약" }`, SALES_PRESET에 추가 → GREEN → 커밋

## PR-A — Task 3: quotes 납품일

- [ ] **3-1.** db-test: issued 견적의 delivery_date/time UPDATE 성공(동결 예외), items 동시 변경은 여전히 거부
- [ ] **3-2.** 마이그레이션 `20260612150001_quotes_delivery.sql`:

```sql
-- 납품 일정 — 발행(issued) 후 입력. 동결 트리거는 명시 컬럼만 검사하므로 별도 예외 불필요(실측).
alter table public.quotes
  add column delivery_date date,
  add column delivery_time time;
comment on column public.quotes.delivery_date is '납품 예정일(발행 후 입력)';
```

  롤백: `alter table public.quotes drop column delivery_date, drop column delivery_time;`
- [ ] **3-3.** reset + db-tests GREEN → 커밋

## PR-A — Task 4: 슬롯·충돌 순수 로직 (TDD)

`apps/web/src/lib/demo-reservations/slots.ts` — 모두 KST 문자열(`YYYY-MM-DD`, `HH:mm`) 기반 순수 함수:
- `SLOT_TIMES`: 09:00~17:45 15분 간격 36개
- `kstRangeIso(date, startHHmm, durationMin) → { startIso, endIso }`(`+09:00` 오프셋 명시)
- `addMinutesHHmm(hhmm, min) → HH:mm`
- `overlapsRange(aS,aE,bS,bE) → boolean`(반개구간 [start,end))
- `computeSelection(startHHmm, durationMin, existing:{start,end}[]) → { slots: HH:mm[], conflict: boolean, exceedsClose: boolean }`(end > 18:00 검출)
- `occupiedSlotSet(existing) → Set<HH:mm>`(범위에 걸친 15분 슬롯 전부)
- 테스트 케이스: 13:00+90분 vs 14:00–15:30 기존 → conflict=true / 10:00+90분 → false / 17:30+60분 → exceedsClose / 경계 14:30 시작 vs ~14:30 종료 기존 → 충돌 아님(반개구간)
- [ ] **4-1.** 테스트 작성(RED) → **4-2.** 구현(GREEN) → **4-3.** 커밋

## PR-A — Task 5: 쿼리 + 서버 액션

- [ ] **5-1.** `queries.ts`: `listReservationsForDate(dateKst)`(time_range `ov` 그날 KST 범위, status≠canceled, equipment name join), `listDotDaysForMonth(yyyymm)`(데모 예약일 + quotes.delivery_date → {demo: string[], delivery: string[]}), `listUpcoming(limit=5)`(데모+납품 union, JS 병합)
- [ ] **5-2.** `actions.ts` zod 스키마:

```ts
const createSchema = z.object({
  companyId: z.guid().nullable(),
  customerName: z.string().trim().min(1).max(200),
  equipmentId: z.guid(),
  visitorName: z.string().trim().max(80).optional(),
  visitorPhone: z.string().trim().max(32).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).refine(isQuarter, "15분 단위만"),
  durationMin: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  memo: z.string().trim().max(2000).optional(),
}).refine(운영시간내 09:00 이상 · 종료 ≤ 18:00);
```

  `createDemoReservation`: requirePermission(`demo_reservations.write`) → zod → INSERT(`time_range: [startIso,endIso)`) → error.code === "23P01" 이면 `{ status:"conflict", message:"방금 다른 예약이 등록되었습니다. 다른 시간을 선택해주세요." }` → 성공 시 revalidatePath + `{status:"ok"}`. `cancelDemoReservation(id)`: status='canceled'.
- [ ] **5-3.** 액션 입력검증 단위테스트(15분 아님·운영시간 밖 거부) → 커밋

## PR-A — Task 6: 페이지 2개 + 사이드바

- [ ] **6-1.** Icon.tsx에 `calendarCheck`(lucide CalendarCheck 패스 인라인) 추가, layout.tsx items의 소모품신청 다음에 `{ href:"/admin/demo-reservations", label:"데모예약", icon:"calendarCheck", show:true, section:"업무" }`(조회는 전 직원)
- [ ] **6-2.** 목록 페이지(`?date=` 기본 오늘 KST): 좌 330px `DemoMonthCalendar`(틸 dot=데모, 파랑 dot=납품, 날짜 클릭 → `?date=` replace), 우 `DayTimeline`(09–18 1시간 행 그리드, 예약 블록 = 분단위 top/height 절대배치, 내용 = 장비명/HH:mm–HH:mm(N분)/고객·방문자·연락처·담당자, 클릭 → `ReservationDetailDialog` 상세+취소), 헤더 우측 "+ 예약 등록" → `/admin/demo-reservations/new?date=`
- [ ] **6-3.** 등록 페이지: `NewReservationForm`(RHF+zod) — 고객 콤보(기존 고객 검색 = fetchCustomers 서버액션 재사용 + "미등록 직접 입력" 토글), 장비 Select(active 카탈로그), 방문자·연락처, 날짜, 소요시간 라디오(30/60/90/120), `TimeSlotPicker`(4열 그리드: 점유=disabled+취소선, 선택범위=민트 하이라이트, 충돌=경고 배너+저장 disabled, 소요시간 변경 시 재계산 — Task 4 순수함수 사용), 우측 `DaySummaryPanel`(그날 예약 요약 + "데모센터 1곳, 동시간대 1건" 안내). 저장 성공 → 토스트 + 목록 이동
- [ ] **6-4.** dev 3100 시각 확인(클린 reset+seed+샘플 예약 REST 삽입) → 스크린샷 Read 대조 → 커밋

## PR-A — Task 7: 견적 상세 납품일 입력

- [ ] **7-1.** `setQuoteDelivery` 서버 액션(quotes.write 가드, zod: date·HH:mm|null) — issued 아닐 때 거부
- [ ] **7-2.** QuoteSummaryPanel(또는 인접 카드)에 "납품 일정" date+time 입력, `quote.status==='issued'`일 때만 활성(draft면 disabled+안내) → 시각 확인 → 커밋

## PR-A — Task 8: e2e + 게이트 + ship

- [ ] **8-1.** `e2e/demo-reservations.spec.ts`: ① 14:00–15:30 시드 → 등록 페이지 13:00+90분 → 경고 배너 + 저장 disabled ② 10:00+90분 → 저장 성공 → 목록 타임라인에 블록 표시 ③ 사이드바 메뉴 진입 ④ 취소 후 같은 시간 재등록 가능
- [ ] **8-2.** 게이트: `supabase db reset` → `seed-local.sh` → shared test · web test · db-tests · typecheck · lint · build · e2e · `as any` 0
- [ ] **8-3.** `/ship`: 브랜치 `feat/demo-reservations`, VERSION v0.13.0.0, PR 생성 → 머지 후 `supabase db push`

## PR-B — Task 9: 공용 일정 포맷 유틸 (TDD)

- [ ] `apps/web/src/lib/format/schedule.ts`: `formatMonthDayWeekday(iso|date) → "6/12 (금)"`, `formatHm(iso) → "14:00"`, `formatHmRange(startIso,endIso) → "14:00–15:30"`, `formatRelative(iso, nowIso) → "3시간 전"/"2일 전"`(KST 기준, date-kst.ts 패턴 따름) + 테스트 → 커밋

## PR-B — Task 10: 대시보드 집계 쿼리 + 순수 로직 (TDD)

- [ ] **10-1.** `v2-logic.ts` + test:
  - `buildTwoWeekDays(todayKst) → 14일(이번 주 월~다음 주 일)` 주 시작=월
  - `groupEventsByDay(events)` / 이벤트 5종 정렬(시간 있는 것 먼저)
  - `demoUtilization(reservedMin, weekdays=5, hoursPerDay=9) → %`
  - `buildWeeklyUnits(rows, maxPerDay=12) → { day, units:[{type}], overflow }`
  - `pipelineRows(counts) → 단계명·비율·건수` + `staleSentCount` 경고 판단
- [ ] **10-2.** `v2-queries.ts`(전부 RLS 통과 invoker 쿼리, Promise.allSettled용 개별 함수):
  - KPI: 기존 countNewApplications/countUnreadServiceRequests/countUnreadSupplyRequests 재사용 + `inProgressQuotes()`(applications status in assigned/quoted/quote_sent 건수 + 각 최신 견적 total 합) + `weekDemoDelivery()`(이번 주 demo_reservations 분합계·건수 + delivery_date 건수) + `customersWithNewThisMonth()`
  - 2주 이벤트: `listCalendarEvents(fromKst,toKst)` — quotes(issued_at)·service_requests(created_at)·supply_requests(created_at)·demo_reservations(lower(time_range))·quotes.delivery_date 5쿼리 병렬 → `{type, id, href, title, dateKst, hm|null}` union
  - 파이프라인: countApplicationsByStatus 재사용 + `staleQuoteSent()`(quote_sent && 최신 issued_at < now-7d)
  - 주간활동: 이번 주 created_at 3종 fetch → JS 그룹
  - 일정 레일: Task 5 `listUpcoming` 재사용 + 이번 달 신청(listRecentRequests 재사용)
- [ ] 커밋

## PR-B — Task 11: 대시보드 컴포넌트 + 페이지 재구성

- [ ] **11-1.** `ScheduleCard.tsx`: 좌측 컬럼 = 날짜 위(`6/12 (금)`)/시간 아래(`14:00` 또는 `14:00–15:30`) 2줄 공용 포맷 — 일정 레일·이번 달 신청·최근 활동 공용
- [ ] **11-2.** `KpiCards.tsx`: 처리 대기(합산≥1 코랄 스타일)/진행 중 견적(건수+₩합계)/이번 주 데모·납품(+가동률%)/전체 고객(+이번 달 신규)
- [ ] **11-3.** `TwoWeekCalendar.tsx`: "이번 주"/"다음 주" 라벨 구분선 2줄×7열, 이벤트 칩 = 좌측 보더+옅은 배경(견적 파인·A/S 코랄·소모품 라임·데모 틸·납품 파랑), 지난 요일 opacity-55, 오늘 민트 하이라이트, `HH:mm ` 접두, 클릭 → 레코드 링크
- [ ] **11-4.** `PipelineRows.tsx`: 세로 행(단계명 74px + 비율 바 + 건수), 행 클릭 → `/admin/applications?status=`, 7일 경과 코랄 노트
- [ ] **11-5.** `WeeklyUnitChart.tsx`: 블록 1개=1건 스택(파인/코랄/라임), 열 상단 합계, hover tooltip(유형·건명), 12건 초과 "+N"
- [ ] **11-6.** `DashboardRightRail.tsx`: "데모 및 납품 일정"(최대 5건, ScheduleCard, "예약 관리 →" 링크) + "이번 달 신청" / `RecentActivity.tsx` 동일 포맷
- [ ] **11-7.** page.tsx 재구성(서버 컴포넌트, allSettled, 역할 라벨 기존 로직 유지), ConsoleMain max-w 1320→1180
- [ ] **11-8.** dev 시각 확인(1440px 스크린샷 Read 대조: 2주 구분선·세로 파이프라인·단위블록·2줄 날짜형식) → 커밋

## PR-B — Task 12: e2e + 게이트 + ship

- [ ] dashboard e2e(KPI 4장·캘린더·파이프라인 렌더 + 영업 계정 로그인 시 본인 스코프 확인) → 게이트 전체 → `/ship` 브랜치 `feat/dashboard-v2`, v0.13.1.0

## 검증 매핑(스펙 요구 → 구현 위치)

1. 시안 스크린샷 비교 → 시안 부재로 **스펙 문구 대조**(11-8)
2. 13:00+90 충돌/10:00+90 성공 → e2e 8-1
3. 동시성 병렬 INSERT → db-tests 1-1
4. 10:07 서버 직접 호출 거부 → 액션 단위테스트 5-3 + db-test 1-1
5. 영업 계정 스코프 → e2e 12
