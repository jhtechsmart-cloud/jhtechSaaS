# 데모예약 개편 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 데모예약을 "한 예약에 여러 장비(체크박스·대분류 분류)·같은 장비만 시간 겹침 차단·영업담당자 지정"으로 개편한다.

**Architecture:** `demo_reservations`에서 `equipment_id`를 제거하고 자식 테이블 `demo_reservation_equipment`(예약↔장비 N)로 옮긴다. 자식의 `EXCLUDE(equipment_id =, time_range &&)`가 같은 장비 겹침만 차단(다른 장비 OK). 저장은 SECURITY DEFINER RPC가 부모+자식을 원자적으로 INSERT. 담당자는 `demo_reservations.assignee_id`.

**Tech Stack:** Postgres(btree_gist·tstzrange·EXCLUDE·SECURITY DEFINER RPC) · Supabase RLS(capability `has_permission`) · Next.js(App Router·RHF) · Vitest·Playwright·db-tests(pg set role).

## Global Constraints
- 단일테넌트 capability RLS: `has_permission(uid, key)` 기반. SECURITY DEFINER 함수는 `set search_path=''` + 권한·행스코프 명시 검사.
- 서버 통제값(status·created_by·time_range)은 RPC/트리거로 강제(클라 미신뢰).
- 마이그 = 한 의도, 롤백 스크립트 `supabase/rollback/`(단수)에 `_down.sql`.
- 게이트: shared test·web test·db-tests(클린 reset+seed)·web typecheck·lint·build·e2e·`as any` 0. **db-tests/e2e 전 GRANT 복구**(memory `supabase-local-grant-regression`, tables/sequences만·functions 제외).
- KST 변환은 기존 `kstRangeIso(date, startTime, durationMin)` 재사용(slots.ts).
- 코드 주석 한국어.

---

### Task 1: DB 마이그 — 자식 테이블 + assignee + 데이터 이전 + RLS + 트리거

**Files:**
- Create: `supabase/migrations/20260629130000_demo_reservation_equipment.sql`
- Create: `supabase/rollback/20260629130000_demo_reservation_equipment_down.sql`

**Produces:** 테이블 `demo_reservation_equipment(id, reservation_id, equipment_id, time_range, status)`; `demo_reservations.assignee_id`; `demo_reservations.equipment_id` 제거.

- [ ] **Step 1: 마이그 작성**

```sql
-- 데모예약 복수 장비 + 장비별 겹침. equipment_id(단수)를 자식 테이블로 이동.
-- 자식 EXCLUDE(equipment_id =, time_range &&) = 같은 장비 겹침만 차단(다른 장비 OK).
-- btree_gist는 demo_reservations 마이그에서 이미 생성됨.

-- 1) 담당자(영업) 컬럼 — nullable(미지정 허용).
alter table public.demo_reservations
  add column assignee_id uuid references public.profiles (id);
comment on column public.demo_reservations.assignee_id is '데모 담당 영업(미지정 가능).';

-- 2) 자식 테이블 — 예약↔장비 N. time_range·status는 부모서 동기화(EXCLUDE where가 자식 컬럼만 참조 가능해 비정규화).
create table public.demo_reservation_equipment (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.demo_reservations (id) on delete cascade,
  equipment_id   uuid not null references public.equipment (id),
  time_range     tstzrange not null,
  status         text not null,
  -- 같은 장비 + 겹치는 시간(취소 제외) 차단. 다른 장비면 허용.
  constraint dre_no_overlap
    exclude using gist (equipment_id with =, time_range with &&) where (status <> 'canceled'),
  -- 한 예약에 같은 장비 중복 금지.
  constraint dre_unique_eq unique (reservation_id, equipment_id)
);
create index dre_reservation_idx on public.demo_reservation_equipment (reservation_id);
create index dre_time_gist on public.demo_reservation_equipment using gist (time_range);

-- 3) 기존 데이터 이전 — 각 예약의 단수 equipment_id를 자식 1행으로.
insert into public.demo_reservation_equipment (reservation_id, equipment_id, time_range, status)
  select id, equipment_id, time_range, status from public.demo_reservations;

-- 4) 단수 컬럼 제거.
alter table public.demo_reservations drop column equipment_id;

-- 5) 부모 status 변경 시 자식 동기화(취소=자식도 canceled). time_range는 현재 수정 기능 없어 status만.
create or replace function public.demo_reservations_sync_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    update public.demo_reservation_equipment
      set status = new.status
      where reservation_id = new.id;
  end if;
  return null; -- AFTER 트리거
end;
$$;
create trigger demo_reservations_sync_children_trg
  after update on public.demo_reservations
  for each row execute function public.demo_reservations_sync_children();

-- 6) RLS — 조회=전 직원, 쓰기/삭제는 RPC(SECURITY DEFINER) 경유가 주 경로지만 정책도 부모와 일관.
alter table public.demo_reservation_equipment enable row level security;
create policy dre_select on public.demo_reservation_equipment
  for select to authenticated using (true);
create policy dre_insert on public.demo_reservation_equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));
create policy dre_update on public.demo_reservation_equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'demo_reservations.write')))
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));
create policy dre_delete on public.demo_reservation_equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
```

- [ ] **Step 2: 롤백 작성**

```sql
-- 롤백: equipment_id 복원(첫 자식 행으로) 후 자식 테이블·트리거·assignee 제거.
alter table public.demo_reservations add column equipment_id uuid references public.equipment (id);
update public.demo_reservations r set equipment_id = (
  select e.equipment_id from public.demo_reservation_equipment e
  where e.reservation_id = r.id order by e.id limit 1);
alter table public.demo_reservations alter column equipment_id set not null;
drop trigger if exists demo_reservations_sync_children_trg on public.demo_reservations;
drop function if exists public.demo_reservations_sync_children();
drop table if exists public.demo_reservation_equipment;
alter table public.demo_reservations drop column if exists assignee_id;
```

- [ ] **Step 3: 로컬 적용 + 검증**

```bash
npx supabase db reset
# GRANT 복구(tables/sequences만) — memory 절차
DBURL=$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')
psql "$DBURL" -q -c "grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; grant usage,select on all sequences in schema public to anon,authenticated,service_role; alter default privileges for role postgres in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role; alter default privileges for role postgres in schema public grant usage,select on sequences to anon,authenticated,service_role;"
psql "$DBURL" -c "\d public.demo_reservation_equipment"
```
Expected: 테이블·EXCLUDE 제약 존재. demo_reservations에 equipment_id 없음·assignee_id 있음.

- [ ] **Step 4: 커밋** `git add supabase/migrations/20260629130000_* supabase/rollback/20260629130000_* && git commit -m "feat(db): 데모예약 자식 테이블(장비별 겹침)+담당자+데이터이전"`

---

### Task 2: 저장 RPC — `create_demo_reservation`

**Files:**
- Create: `supabase/migrations/20260629131000_demo_reservation_rpc.sql`
- Create: `supabase/rollback/20260629131000_demo_reservation_rpc_down.sql`

**Interfaces:**
- Produces RPC:
  ```
  create_demo_reservation(p_company_id uuid, p_customer_name text, p_visitor_name text,
    p_visitor_phone text, p_assignee_id uuid, p_memo text,
    p_time_range tstzrange, p_equipment_ids uuid[]) returns uuid
  ```
  반환 = 새 예약 id. EXCLUDE 위반은 errcode `23P01` 그대로 전파(actions가 conflict 처리).

- [ ] **Step 1: RPC 작성**

```sql
-- 데모예약 저장 — 부모 1행 + 자식 N행 원자적. SECURITY DEFINER가 RLS 우회하므로 권한·값 명시 검증.
create or replace function public.create_demo_reservation(
  p_company_id uuid,
  p_customer_name text,
  p_visitor_name text,
  p_visitor_phone text,
  p_assignee_id uuid,
  p_memo text,
  p_time_range tstzrange,
  p_equipment_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_eq  uuid;
  v_cnt int;
begin
  if not public.has_permission(v_uid, 'demo_reservations.write') then
    raise exception '데모예약 등록 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception '고객명을 입력하세요' using errcode = 'check_violation';
  end if;
  if p_equipment_ids is null or array_length(p_equipment_ids, 1) is null then
    raise exception '장비를 1개 이상 선택하세요' using errcode = 'check_violation';
  end if;
  -- 선택 장비는 모두 active + is_demo 여야 한다(폼 우회 방지).
  select count(*) into v_cnt from public.equipment
    where id = any (p_equipment_ids) and status = 'active' and is_demo = true;
  if v_cnt <> array_length(p_equipment_ids, 1) then
    raise exception '데모 가능한 장비만 선택할 수 있습니다' using errcode = 'check_violation';
  end if;
  -- 담당자 지정 시 실재 프로필인지(미지정=null 허용).
  if p_assignee_id is not null and not exists (select 1 from public.profiles where id = p_assignee_id) then
    raise exception '담당자가 올바르지 않습니다' using errcode = 'check_violation';
  end if;

  insert into public.demo_reservations
    (company_id, customer_name, visitor_name, visitor_phone, assignee_id, memo, time_range, status, created_by)
  values
    (p_company_id, btrim(p_customer_name), nullif(btrim(coalesce(p_visitor_name,'')),''),
     nullif(btrim(coalesce(p_visitor_phone,'')),''), p_assignee_id,
     nullif(btrim(coalesce(p_memo,'')),''), p_time_range, 'confirmed', v_uid)
  returning id into v_id;

  -- 자식 N행 — EXCLUDE 위반(23P01)은 그대로 전파.
  foreach v_eq in array p_equipment_ids loop
    insert into public.demo_reservation_equipment (reservation_id, equipment_id, time_range, status)
      values (v_id, v_eq, p_time_range, 'confirmed');
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]) from public, anon;
grant execute on function public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]) to authenticated;
```
(time_range·status·created_by는 서버 강제. demo_reservations BEFORE 트리거가 created_by를 auth.uid()로 재강제하므로 이중 안전.)

- [ ] **Step 2: 롤백** — `drop function if exists public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]);`

- [ ] **Step 3: 적용**(`npx supabase db reset` + GRANT 복구) + 커밋.

---

### Task 3: db-tests — 장비별 겹침

**Files:** Modify `packages/db-tests/src/demo_reservations.test.ts`

**핵심 변경(기존 테스트가 단수 equipment_id INSERT를 자식 테이블/RPC로):**
- "같은 장비 겹침=거부": 같은 equipment_id로 자식 2행 겹침 → 23P01.
- "다른 장비 같은 시간=허용": 다른 equipment_id, 같은 time_range → 둘 다 성공.
- RPC `create_demo_reservation` 경유로 부모+자식 INSERT 검증(권한·is_demo·최소1개).
- 기존 권한/값 제약/서버강제 테스트는 부모 기준 유지(equipment_id 참조 제거).

- [ ] **Step 1:** 위 시나리오로 테스트 재작성(기존 `RACE_EQ` 단수 INSERT → 자식 테이블 직접 INSERT 또는 RPC). 새 핵심 테스트:
```ts
test("다른 장비는 같은 시간대 허용", async () => {
  // eqA, eqB 시드(active+is_demo). 부모 1건 + 자식 eqA[14:00,15:30)
  // 부모 2건 + 자식 eqB[14:00,15:30) → 성공(다른 장비)
  // 부모 3건 + 자식 eqA[14:00,15:30) → 23P01(같은 장비 겹침)
});
```
- [ ] **Step 2:** `npx supabase db reset` + GRANT 복구 + seed 후 `pnpm --filter @jhtechsaas/db-tests test:rls -- demo_reservations` 통과. 커밋.

---

### Task 4: shared/schema/queries — 배열 장비·담당자

**Files:**
- Modify: `apps/web/src/lib/demo-reservations/schema.ts`(equipmentId→equipmentIds 배열, assigneeId 추가)
- Modify: `apps/web/src/lib/demo-reservations/queries.ts`(DemoReservationRow: equipmentNames[]·assigneeName; SELECT_COLS 자식 조인)

- [ ] **Step 1: schema.ts** — `equipmentId: z.guid()` → `equipmentIds: z.array(z.guid()).min(1, "장비를 1개 이상 선택하세요")`, `assigneeId: z.guid().nullable().default(null)` 추가.
- [ ] **Step 2: queries.ts** — `DemoReservationRow.equipmentName: string` → `equipmentNames: string[]`, `assigneeName: string | null` 추가. `SELECT_COLS`를 `"...,assignee:assignee_id(name),demo_reservation_equipment(equipment:equipment_id(name))"`로. 매핑에서 `equipmentNames = row.demo_reservation_equipment.map(x => x.equipment.name)`. `listActiveEquipmentOptions`는 Phase 1에서 이미 is_demo+category_id.
- [ ] **Step 3:** `pnpm --filter web typecheck`(타입 에러 = 소비처 표시). 커밋.

---

### Task 5: actions + 담당자 조회 + page props

**Files:**
- Modify: `apps/web/src/lib/demo-reservations/actions.ts`(createDemoReservation → RPC 호출, equipmentIds·assigneeId)
- Modify: `apps/web/src/app/admin/demo-reservations/page.tsx` 및 new 페이지(staff 조회 prop 주입)
- Create: `apps/web/src/lib/demo-reservations/staff.ts`(영업담당 조회) 또는 queries.ts에 `listDemoStaff()`

- [ ] **Step 1: actions** — `createDemoReservation`이 `supabase.rpc("create_demo_reservation", { p_company_id, p_customer_name, p_visitor_name, p_visitor_phone, p_assignee_id, p_memo, p_time_range: \`[${startIso},${endIso})\`, p_equipment_ids })` 호출. 23P01(또는 PostgREST error code) → conflict 메시지. `kstRangeIso`로 startIso/endIso.
- [ ] **Step 2: 담당자 조회** `listDemoStaff()` — `profiles`에서 `is_active=true` + permissions에 `demo_reservations.write`(또는 admin) 보유자. PostgREST `.contains("permissions", ["demo_reservations.write"])` 또는 전 직원(미지정 허용이므로 단순화: is_active 직원 전체, 이름순). **결정: is_active 직원 전체**(권한 세분화는 비목표). 반환 `{id, name}[]`.
- [ ] **Step 3: page props** — demo 페이지(new 폼 포함)가 `listDemoStaff()` 호출 → `NewReservationForm`에 `staff` prop. 커밋.

---

### Task 6: NewReservationForm UI — 체크박스 그리드 + 담당자

**Files:**
- Modify: `apps/web/src/app/admin/demo-reservations/_components/NewReservationForm.tsx`
- Create: `apps/web/src/lib/demo-reservations/equipment-grouping.ts`(+ test) — 장비를 대분류(프린터/커팅기)로 분류하는 순수 함수

**Interfaces:**
- Produces `groupDemoEquipment(options: EquipmentOptionRow[], categories: CategoryNode[]): { printer: EquipmentOptionRow[]; cutter: EquipmentOptionRow[]; etc: EquipmentOptionRow[] }`
  - 각 장비의 `category_id` → 대분류 루트(`parent_id is null`)로 거슬러 `quote_logo_kind`(`printer`/`cutter`) 판정. 미설정=etc.

- [ ] **Step 1(TDD):** `equipment-grouping.test.ts` — 프린터 대분류 소속 장비는 printer, 커팅기는 cutter, 분류 없음/미설정은 etc로 묶임. 순수 함수라 node 단위테스트.
- [ ] **Step 2:** `groupDemoEquipment` 구현(`resolveLogoKind` 패턴 재사용 — category-tree.ts의 루트 거슬러올라가기).
- [ ] **Step 3: 폼 개편** — 상태 `equipmentId`(string) → `equipmentIds`(string[]), `assigneeId`(string|null) 추가. '데모 장비' 드롭다운 자리에 **담당자 select**(staff). 시작시간 위에 **장비 체크박스 2열 그리드**(좌 프린터/우 커팅기, etc는 아래). 겹침: 선택 장비별 점유 슬롯 합집합 → TimeSlotPicker `existing`을 선택 장비들의 예약만 필터(자식 조인 데이터에서 equipmentId별). submit은 `equipmentIds`·`assigneeId` 포함. canSave에 `equipmentIds.length>0`.
- [ ] **Step 4:** 점유 슬롯 계산 = `reservations` 중 선택 장비를 포함한 예약만(자식 데이터에서 equipment id 매칭). `DemoReservationRow`에 자식 equipmentId 목록 필요 → queries에 `equipmentIds: string[]`도 추가(Task 4 보강).
- [ ] **Step 5:** `pnpm --filter web test`(grouping 단위) + typecheck. 커밋.

---

### Task 7: 캘린더/현황 표시 — 장비명 목록 + 담당자

**Files:** Modify `DayTimeline.tsx`·`MonthReservationList.tsx`·`DaySummaryPanel.tsx`·`ReservationDetailDialog.tsx`·`dashboard`의 `listUpcomingSchedules`

- [ ] **Step 1:** 각 컴포넌트의 `equipmentName`(단수) 참조를 `equipmentNames.join(", ")`로. 담당자(`assigneeName`) 표시 줄 추가(이미 createdByName 표시하는 곳은 담당자 우선/병기). 대시보드 데모 타이틀 "고객 · 장비명들 데모".
- [ ] **Step 2:** typecheck + 커밋.

---

### Task 8: e2e + 전체 게이트

**Files:** Modify `apps/web/e2e/demo-reservations.spec.ts`

- [ ] **Step 1: e2e** — 시드를 자식 테이블/RPC 기준으로. 시나리오: 장비 2개 시드(is_demo), 체크박스로 1개 선택+담당자+10:00 등록 성공 → 블록에 장비명·담당자 표시. 같은 장비·겹치는 시간 충돌 경고. 다른 장비는 같은 시간 허용.
- [ ] **Step 2: 전체 게이트** — `npx supabase db reset` + GRANT 복구 + `bash supabase/seed/seed-local.sh`, 그 다음 `pnpm --filter @jhtechsaas/shared test`·`web test`·`@jhtechsaas/db-tests test:rls`·`web typecheck`·`web lint`·`web build`·`web test:e2e`. demo 동시성 db-test는 환경 flaky(무관) 허용.
- [ ] **Step 3: 시각 검증** — dev 서버 + (admin browse 로그인 제약 시) 최소한 데모예약 폼 렌더를 e2e/스크린샷으로 확인: 체크박스 그리드(좌 프린터/우 커팅기)·담당자 드롭다운·장비명+담당자 캘린더 표시.
- [ ] **Step 4: 커밋 + PR + 머지 + `supabase db push`**(prod 마이그 적용).

---

## Self-Review
- **Spec coverage:** 복수장비(T1 자식·T6 체크박스) · 장비별겹침(T1 EXCLUDE·T2 RPC·T3 db-test) · 담당자(T1 assignee·T5 조회·T6 드롭다운·T7 표시) · 데모플래그필터(Phase 1·T2 RPC 재검증) · 대분류분류(T6 grouping) · 캘린더(T7) · 기존데이터이전(T1) · 캘린더텍스트(T7). 전 항목 커버.
- **Placeholder scan:** SQL·RPC는 완전. UI(T6)는 구조+핵심 — 폼 코드 전량은 구현 시 기존 NewReservationForm 기반 수정(라인 정확 인용은 구현 단계).
- **Type consistency:** `equipmentIds`/`assigneeId`(schema·actions·form), `equipmentNames`/`assigneeName`/`equipmentIds`(DemoReservationRow·표시·겹침), RPC 인자명(`p_*`) actions와 일치, `groupDemoEquipment` 반환(printer/cutter/etc) T6 내 일관.

## 비목표 (YAGNI)
- 데모센터 복수 지점 · 장비별 색 · 담당자 권한 세분화 · 예약 수정(취소후 재등록 유지) · 부모 time_range 변경 트리거(현재 status만).
