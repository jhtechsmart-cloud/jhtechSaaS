# 데모예약 개편 — 복수 장비·장비별 겹침·담당자·데모 플래그

**한 문장 요약**: 데모예약을 "한 예약에 여러 장비(체크박스·대분류 분류)·같은 장비만 시간 겹침 차단·영업담당자 지정"으로 개편하고, 장비에 '데모 가능' 플래그를 둔다.

**왜 필요한지**: 지금은 한 예약에 장비 1개(드롭다운)만, 센터 전체에서 한 시간에 한 팀만 가능하다. 실제로는 한 고객이 여러 장비를 함께 데모하고, 다른 장비라면 같은 시간에 다른 팀도 받을 수 있어야 한다. 또 모든 장비가 데모 대상은 아니므로 장비별로 '데모 가능'을 지정한다.

규모가 커서 **2단계(PR 2개)**로 나눈다. Phase 1이 Phase 2의 전제(데모 장비 필터).

---

## Phase 1 — 장비 '데모 가능' 플래그

### DB
- `equipment.is_demo boolean not null default false` 컬럼 추가(마이그 + 롤백).

### UI
- 장비 추가/편집 폼(`EquipmentForm.tsx`): **장비명 input 옆에 "데모 가능" 체크박스**. RHF 필드 `is_demo`.
- 저장 경로(서버액션/RPC)에 `is_demo` 반영. web Zod 스키마에 `is_demo: z.boolean()` 추가.

### 조회
- `listActiveEquipmentOptions()`(데모예약 폼용): `eq("status","active")`에 **`eq("is_demo", true)`** 추가. 반환에 `category_id`도 포함(대분류 판별용).

### 게이트
web test·e2e(equipment)·typecheck·lint·build. 마이그 push.

---

## Phase 2 — 데모예약 개편

### 데이터 모델

| 테이블 | 변경 | 핵심 |
|---|---|---|
| `demo_reservations` | `equipment_id` **제거**, `assignee_id uuid references profiles` **추가**(nullable=미지정) | 예약 1건의 메타(고객·시간·담당자·메모) |
| `demo_reservation_equipment` (**신규 자식**) | `id`·`reservation_id`(FK on delete cascade)·`equipment_id`(FK)·`time_range tstzrange`·`status text` | 예약↔장비 N개 |

**겹침 차단**: 자식 테이블에
```sql
constraint dre_no_overlap
  exclude using gist (equipment_id with =, time_range with &&) where (status <> 'canceled')
```
→ **같은 장비**의 시간 겹침만 거부. **다른 장비면 같은 시간 OK**. (btree_gist 확장 이미 사용 중.)

**time_range·status 동기화**: 자식의 `time_range`·`status`는 부모에서 비정규화한 값. 부모 INSERT/UPDATE 트리거가 자식에 동기화(부모 취소 시 자식도 `canceled`). EXCLUDE `where` 절이 자식 컬럼만 참조 가능하므로 비정규화가 불가피.

**저장 = RPC**(SECURITY DEFINER, 원자적): 부모 1행 + 자식 N행을 한 트랜잭션에. 서버가 강제: `created_by=auth.uid()`, `status='confirmed'`, time_range(KST 변환), 장비 active+is_demo 검증, 최소 1개 장비. EXCLUDE 위반(23P01)은 "방금 다른 예약이…" 충돌 메시지로.

**기존 데이터 이전**(마이그): 기존 `demo_reservations` 각 행의 `(id, equipment_id, time_range, status)`를 `demo_reservation_equipment` 1행으로 복사한 뒤 `equipment_id` 컬럼 drop.

### RLS (자식 테이블)
- SELECT: `to authenticated using (true)` (조회 전 직원, 부모와 동일).
- INSERT/UPDATE/DELETE: 직접 쓰기는 막고 **RPC(SECURITY DEFINER) 경유만**. 정책은 `demo_reservations.write`(쓰기)·`users.manage`(삭제) 기준으로 부모와 일관. (RPC가 권한·행스코프 검증.)

### 폼 UI (`NewReservationForm.tsx`)
```
[고객 *]                         [담당자 ▼]      ← 기존 '데모 장비' 드롭다운 자리 = 담당자 select
[방문자] [연락처] [날짜 *] [소요 시간 *]

데모 가능 장비 * (체크박스 · 대분류 분류)        ← 시작 시간 위
┌──── 프린터 ─────────┬──── 커팅기 ─────────┐
│ ☑ UV3300S (model)   │ ☐ R16              │
│ ☐ XTRA 3300S        │ ☑ …                │   전부 표시(스크롤 아님), 2열
└─────────────────────┴────────────────────┘

[시작 시간 슬롯…]   ← 선택 장비 중 하나라도 겹치는 시간은 비활성/경고
```
- 장비를 **대분류로 분류**: `category_id` → 대분류 루트(`parent_id is null`)로 거슬러, `quote_logo_kind`(`printer`/`cutter`) 또는 대분류명으로 좌/우 컬럼 배치. (대분류 판별 = 기존 `category-tree.ts`/`resolveLogoKind` 패턴 재사용.)
- 담당자 select = `profiles`에서 `demo_reservations.write` 권한자 목록(부모 페이지가 조회해 prop 주입, CompanyForm `staff` 패턴).
- 최소 1개 장비 선택 필수.

### 겹침 판정 (클라 1차)
- 선택한 **각 장비별로** 그 장비의 기존 예약 시간대를 점유 슬롯으로 합집합 → TimeSlotPicker 비활성. 다른 장비 예약은 무시.
- 서버(RPC) 2차, DB EXCLUDE 3차.

### 캘린더/현황 표시
- `DemoReservationRow`: `equipmentName: string`(단수) → `equipmentNames: string[]`(복수), `assigneeName: string | null` 추가.
- DayTimeline 블록·MonthReservationList·DaySummaryPanel·ReservationDetailDialog: **장비명 목록 + 담당자** 표시. 색은 현재 데모=보라 단일색 유지.
- 대시보드 `listUpcomingSchedules`: 데모 타이틀 "고객 · 장비명들 데모"로.

### 조회 쿼리
- `SELECT_COLS`에 자식 조인: `demo_reservation_equipment(equipment:equipment_id(name))` + `assignee:assignee_id(name)`.

### 테스트
- `packages/db-tests/src/demo_reservations.test.ts`: 자식 테이블 EXCLUDE로 재작성 — **같은 장비 겹침=거부 / 다른 장비 같은 시간=허용**, 취소 후 재등록, 동시성, 서버강제 필드. RPC 경유 검증.
- `apps/web/e2e/demo-reservations.spec.ts`: 복수 장비 선택·장비별 겹침·담당자·캘린더 표시로 갱신.

### 게이트
web test·worker(영향 없음)·db-tests(클린 reset+seed)·web typecheck·lint·build·e2e. 마이그 push.

---

## 비목표 (YAGNI)
- 데모센터 복수 지점 · 장비별 색 구분(텍스트로 갈음) · 담당자별 권한 분리 · 예약 수정(현재 취소 후 재등록 유지).

## 미해결/플랜에서 결정
- 부모 time_range 변경(현재 수정 기능 없음)이 생기면 자식 동기화 트리거 필요 — 현재는 취소만이라 status 동기화만 우선.
- 자식 status 비정규화 vs 취소 시 자식 행 삭제: **비정규화 채택**(이력 보존, 현재 부모 패턴과 일관).
