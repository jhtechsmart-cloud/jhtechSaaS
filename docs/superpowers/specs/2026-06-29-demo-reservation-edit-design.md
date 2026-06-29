# 데모예약 수정 기능 설계

> **한 문장 요약:** 이미 등록한 데모예약을 (장비·시간 포함) 전체 수정할 수 있게, 등록 폼을 재사용한 수정 화면 + 대칭 RPC를 추가한다.
>
> **왜 필요한가:** 지금은 데모예약을 잘못 입력하면 취소하고 다시 등록해야 한다. 고객·담당자·장비·시간을 그 자리에서 고칠 수 있어야 운영이 매끄럽다. Phase 2(복수장비 개편)에서 YAGNI로 빼뒀던 부분을 사용자 요청으로 추가한다.

**브랜치:** `feat/demo-multi-equipment` (PR #183, 미머지 — 같은 개편의 일부라 이어 붙임)

## 범위
- **전체 수정**: 고객·담당자·방문자·연락처·장비 선택(복수)·날짜·시작시간·소요시간·메모.
- 수정 대상 = **취소 안 된 예약**(confirmed/done 모두). 상태 자체는 수정으로 안 바꿈(유지).
- 권한 = 등록과 동일 `demo_reservations.write`(담당자 무관, 등록과 일관).

## 아키텍처 (등록 폼 재사용)

### 1) 진입점
`ReservationDetailDialog`에 **'수정' 버튼**(취소 옆) 추가 — 취소 안 된 예약에만. `/admin/demo-reservations/[id]/edit`로 이동.

### 2) 수정 라우트
`apps/web/src/app/admin/demo-reservations/[id]/edit/page.tsx`
- 권한 가드(`requireDemoReservationsWrite`).
- 예약 단건 조회(`getDemoReservation(id)`) + `listActiveEquipmentOptions` + `listDemoStaff` + `listCategoryTree` 병렬.
- 취소된 예약이면 404/안내.
- 폼 셸에 초기값·`editingId` 주입.

### 3) 폼·셸 일반화 (최소 변경)
- `NewReservationShell` → `mode`/`initial`/`editingId` 선택 prop 추가. 등록은 기존 동작 유지(기본값).
  - `editingId`가 있으면 해당일 예약 목록에서 **자기 예약을 필터링**(겹침 자기-제외).
- `NewReservationForm` → 선택 prop:
  - `initial?: ReservationFormInitial`(없으면 빈 폼 = 등록).
  - `editingId?: string`(있으면 수정 모드: 버튼 라벨 '수정 저장', `updateDemoReservation` 호출).
  - 상태 초기화를 `initial` 기반 lazy `useState`로.
- 폼 프리필에 필요한 값: companyId·customerName·equipmentIds·assigneeId·visitorName·visitorPhone·date·startTime·durationMin·memo.
  - ⚠️ `DemoReservationRow`에 현재 `assigneeName`만 있고 **`assigneeId` 없음** → queries에 `assigneeId` 추가(SELECT는 이미 `assignee_id` 포함하도록).

### 4) 저장 RPC `update_demo_reservation`
`create_demo_reservation`과 대칭인 SECURITY DEFINER 함수.
```
update_demo_reservation(p_id uuid, p_company_id uuid, p_customer_name text,
  p_visitor_name text, p_visitor_phone text, p_assignee_id uuid, p_memo text,
  p_time_range tstzrange, p_equipment_ids uuid[]) returns uuid
```
- 권한(`demo_reservations.write`)·고객명·장비 최소 1개·선택 장비 active+is_demo·담당자 실재 검증(create와 동일).
- 대상 예약이 존재 + status <> 'canceled' 확인(아니면 예외).
- 부모 UPDATE: company_id·customer_name·visitor_*·assignee_id·memo·time_range. **status·created_by는 안 건드림**(서버 통제값 유지).
- 자식 **전체 교체**: `delete from demo_reservation_equipment where reservation_id = p_id` → 새 `p_equipment_ids`로 INSERT(`status`는 부모 현재 status 사용). 같은 트랜잭션이라 자기 옛 장비와는 충돌 안 나고, **다른 예약과의 같은-장비 겹침은 자식 EXCLUDE가 그대로 23P01로 차단**.
  - 교체(delete-all+insert) 정당성: `demo_reservation_equipment`는 외부 FK·이력 참조가 없다(견적·company_equipment와 달리). diff-upsert 불필요.
- `revoke ... from public, anon` / `grant execute to authenticated`.
- 마이그 `supabase/migrations/20260629132000_demo_reservation_update_rpc.sql` + 롤백 `supabase/rollback/20260629132000_..._down.sql`(`drop function`).

### 5) 액션·스키마
- `actions.ts`에 `updateDemoReservation(id, values)` — `requireDemoReservationsWrite` → zod 검증 → `kstRangeIso` → `rpc("update_demo_reservation", {...})`. 23P01 → conflict. 성공 시 `revalidatePath` + `{status:"ok", date}`.
- 스키마 재사용: `createReservationSchema` 그대로(입력 동일). id는 액션 인자로 별도 `z.guid()` 검증.
- `queries.ts`에 `getDemoReservation(id): DemoReservationRow | null`(SELECT_COLS 재사용, `.eq("id", id)`), `DemoReservationRow.assigneeId` 추가.

## 데이터 흐름
1. 상세 다이얼로그 '수정' → `[id]/edit` 페이지.
2. 페이지가 예약·옵션·담당자·분류 로드 → 폼 프리필(자기-제외한 해당일 점유 슬롯).
3. 사용자 수정 → '수정 저장' → `updateDemoReservation` → RPC(부모 UPDATE + 자식 교체).
4. 충돌(같은 장비·다른 예약) → conflict 배너. 성공 → 목록 복귀.

## 에러 처리
- 취소된/없는 예약 수정 시도 → 페이지 404 또는 RPC 예외(`check_violation`) → 안내.
- 같은-장비 겹침 → 23P01 → "같은 장비의 다른 예약과 겹칩니다" 배너 + 슬롯 재조회.
- 권한 없음 → 가드가 forbidden 처리.

## 테스트
- **db-test**(`demo_reservations.test.ts` 보강): update RPC — (a) 자기 시간 유지 수정 허용(자기-제외), (b) 다른 예약 같은-장비 같은시간으로 수정 시 23P01, (c) 다른 장비로 교체 시 자식 set 갱신, (d) 권한 없는 롤 거부.
- **web 단위**: 수정 액션 입력 검증(기존 schema 재사용 확인) — 신규 순수로직 없으면 생략 가능.
- **e2e**(`demo-reservations.spec.ts` 보강): 등록 → 상세 '수정' → 장비/시간 변경 → 저장 → 목록에 변경 반영.

## 비목표 (YAGNI)
- 버전관리·수정 이력 로그(데모예약은 PDF·발행 개념 없음).
- 상태 전이 변경(수정으로 confirmed↔done 안 바꿈 — 기존 상태 유지).
- 담당자 본인으로 권한 제한(등록과 동일하게 write 보유자 전체).
- 부모 time_range 변경 시 자식 동기화 트리거 의존(RPC가 자식을 명시 교체하므로 트리거 무관).

## 게이트
shared test · web test · db-tests:rls(클린 reset+GRANT복구[tables/seq+service_role 함수]+seed) · web typecheck · lint · build · e2e · `as any` 0.
