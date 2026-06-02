# Design: M2 P-C — 소모품 카탈로그 (consumables)

- 작성: 2026-06-02 / 오너: 조선제
- 상태: APPROVED (brainstorm)
- 이슈: #21 (EPIC #18)
- 선행: E2(장비), P-B(고객·구매 마스터)
- 상위 설계: `docs/superpowers/specs/2026-06-01-m2-customer-portal-design.md` §3·§9

## 1. 개요 / 북극성

장비별 소모품을 **분류(category) 또는 특정 장비 단위**로 매핑하는 카탈로그와 admin 관리 기능을 신설한다.
고객용 소모품신청(P-E)·로그인 자동 보유장비 조회는 이 단계 **범위 밖**이지만, "사용 장비 선택 → 매칭 소모품 표시"의 핵심 조회 로직(해석 함수)을 P-C에서 만들어 P-E가 재사용하게 한다.

설계 원칙은 M1·P-B 그대로: 단일테넌트, capability 권한 + 전 테이블 RLS, 서버통제값(created_at/updated_at)은 트리거 불변, 자식행은 id 보존 diff-upsert.

### 도메인 근거 (사용자 확인)

- 분류 'UV프린터'(여러 모델) → UV잉크(여러 컬러) 공용.
- 분류 '솔벤트프린터'(여러 모델) → 솔벤트 잉크 공용.
- 헤드 세정액·와이퍼 → 모든 프린터(UV+솔벤트) 공통.
- 분류 '커팅기' → 커팅칼날·커팅매트·필터·먼지제거 브러쉬 공통.
- 가끔 특정 모델 전용 부품도 생길 수 있음.
- 신청 시 사용 장비를 먼저 선택하면 매칭 소모품이 자동 표시(→ P-E, 토대는 P-C).

이 도메인은 소모품이 **분류 단위로 공용**되는 성격이 강하므로, "소모품↔개별장비" 단순 M:N이면 세정액 같은 공통 소모품을 모델마다 다시 연결해야 하고 새 모델 추가 시 누락 위험이 생긴다. 따라서 **분류 또는 장비를 가리키는 하이브리드 scope** 모델을 택한다.

## 2. 데이터 모델 (마이그레이션 2개 + 해석 함수)

> 모든 도메인 테이블 RLS 필수. SELECT=authenticated 전원, 쓰기=`consumables.manage`.
> 서버통제값(created_at·updated_at)은 BEFORE INSERT/UPDATE 트리거로 불변(P-B `company_equipment` 패턴 재사용).

### 2.1 `consumables` (소모품 마스터)

컬러·품목 단위로 1행. 예: "UV잉크 - 시안", "헤드 세정액", "커팅칼날 30°".

```
id        uuid pk default gen_random_uuid()
name      text not null                          -- char_length ≤ 200
unit      text                                   -- 개/병/L/롤 등 (nullable)
sku       text                                   -- 품번 (nullable, ≤ 100)
price     numeric(14,2)                          -- 내부 참고가, nullable, 고객·공개 비노출
note      text                                   -- ≤ 2000
status    text not null default 'active' check (status in ('active','inactive'))
created_at timestamptz not null default now()    -- 트리거 불변
updated_at timestamptz not null default now()    -- 트리거 갱신
```
- index: `(status)`.
- 가격은 내부 참고값. P-E 소모품신청은 수량만 받고, 가격은 견적 단계에서 결정(장비 `base_price`가 공개뷰에서 제외된 것과 동일 원칙).

### 2.2 `consumable_scope` (매핑 junction — 분류 XOR 장비)

```
id            uuid pk default gen_random_uuid()  -- id 보존 (P-E item·이력 FK 대비)
consumable_id uuid not null references public.consumables (id) on delete cascade
category      text                                -- 예 'UV프린터' (nullable, ≤ 100)
equipment_id  uuid references public.equipment (id) on delete cascade  -- (nullable)
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
constraint consumable_scope_identity
  check ((category is not null) <> (equipment_id is not null))   -- 정확히 하나
constraint consumable_scope_category_len
  check (category is null or char_length(category) <= 100)
```
- 부분 UNIQUE `(consumable_id, equipment_id) WHERE equipment_id is not null` — 같은 소모품·장비 중복 매핑 방지.
- 부분 UNIQUE `(consumable_id, category) WHERE category is not null` — 같은 소모품·분류 중복 방지.
- index: `(consumable_id)`, `(equipment_id)`, `(category)`.
- 트리거: `consumable_scope_enforce_server_fields` (created_at/updated_at 불변·갱신).

> **부분 UNIQUE(`WHERE ...`)는 `ON CONFLICT` arbiter 미작동(42P10)** — 하지만 scope 저장은 `ON CONFLICT`가 아니라 **id 보존 diff-upsert**(삭제만 DELETE·기존 UPDATE·신규 INSERT)라 무관. 부분 UNIQUE는 무결성 가드 역할만 한다. (P-B 확립 규칙 재사용)

매핑 예시:
- UV잉크-시안 → `[category:'UV프린터']`
- 헤드 세정액 → `[category:'UV프린터'][category:'솔벤트프린터']` (모든 프린터 = 분류 2행)
- A모델 전용 부품 → `[equipment_id:<A의 id>]`

### 2.3 해석 함수 `consumables_for_equipment(equip_id uuid)`

```
returns setof public.consumables
language sql
security definer
set search_path = ''
stable
```
로직: 주어진 장비의 `category`를 조회한 뒤,
`scope.equipment_id = equip_id` **OR** `scope.category = <그 장비의 category>` 인 scope를 가진
`status = 'active'` 소모품을 **중복 제거**해 반환. 정렬은 plan 단계 확정(기본 `name`).

- 용도: P-C admin "이 장비에 매칭되는 소모품" 미리보기 + P-E 고객 신청 조회가 재사용.
- 권한: authenticated 호출 가능(읽기 전용). anon 노출은 P-E에서 별도 RPC로 결정(범위 밖).
- 장비 `category`가 null이면 분류 매칭은 없고 장비전용 매핑만 반환.

## 3. 권한 / RLS

- `packages/shared/src/permissions.ts`의 `PERMISSIONS`에 `"consumables.manage"` 키 1개 추가
  (P-B `customers.manage` 선례와 동일). 스키마 변경 0 — 관리자 권한 체크박스에 자동 노출.
- `users.manage`(admin) 보유자는 `has_permission`의 슈퍼권한 분기로 자동 통과(기존 로직, 변경 없음).
- `consumables`·`consumable_scope` 각각 RLS 4정책:
  - SELECT → `to authenticated using (true)`
  - INSERT → `with check (has_permission(uid, 'consumables.manage'))`
  - UPDATE → `using + with check (has_permission(...))`
  - DELETE → `using (has_permission(...))`
  - 정책은 `(select has_permission((select auth.uid()), 'consumables.manage'))` InitPlan 래핑(P-B 동형).

## 4. Admin UX (`/admin/consumables`)

- **진입점**: admin nav에 "소모품" 추가. 라우트 진입 시 `consumables.manage` 게이트 —
  미보유 시 "접근 권한이 없습니다" 렌더(P-B `/admin/customers` 패턴 재사용).
- **목록 페이지**: 소모품 표 — 이름 · 단위 · 품번 · 상태 · **범위 요약**("UV프린터 외 2건").
  숫자·식별자는 mono tabular(DESIGN.md). 상태는 색 스파인.
- **생성/편집 페이지**:
  - 기본 필드: 이름(필수) · 단위 · 품번 · 가격(내부) · 상태 · 비고.
  - **범위 에디터**: 행 추가 시 두 모드 택1 —
    - `[분류 ▼]` = 기존 장비 `category` distinct 드롭다운(자유 타이핑 금지 → 오타·미스매치 방지).
    - `[특정 장비]` = 장비 검색·선택.
    - 행 삭제·추가 자유. 저장 시 `applyConsumableScopeDiff`로 **id 보존 diff-upsert**
      (삭제된 것만 DELETE · 기존 id UPDATE · 신규만 INSERT). `lib/services/`에 작성.
  - 컴포넌트에 비즈니스 로직 직접 작성 금지 — scope diff·검증은 `lib/services/`.

## 5. 테스트 (게이트 전부 통과)

- **순수(Vitest)**:
  - `permissions.test.ts`에 `consumables.manage` registry 존재 + `users.manage` 슈퍼통과 + 단독 보유 격리 케이스(P-B 미러).
  - scope diff 순수 로직(삭제/업데이트/신규 분리) 단위 테스트.
- **db-tests(RLS, `set role` + jwt claims)**:
  - `consumables.manage` 보유/미보유별 `consumables`·`consumable_scope` INS/UPD/DEL 허용·차단.
  - CHECK(`category` XOR `equipment_id`) 위반 INSERT 거부(둘 다 null·둘 다 not null).
  - 부분 UNIQUE 중복 매핑 거부.
  - `consumables_for_equipment`: 분류공통 + 장비전용 dedup·active 필터 단언.
  - ⚠️ 실행 전 `supabase db reset`(전역 카운트 단언 seed 잔여행 취약).
- **E2E(Playwright)**:
  - `/admin/consumables` CRUD + 범위 편집(분류·장비 혼합) 저장.
  - 403: `consumables.manage` 없는 영업 계정 접근 차단.

## 6. Out of scope (P-E 이월)

- 고객용 소모품신청 폼 · `supply_requests` + `supply_request_items` 테이블.
- 로그인 자동 보유장비 조회(구매장비 1개=선택불요, 다수=선택) — 로그인 기능 후속.
- anon/공개 소모품 노출 RPC.
- 소모품 컬러를 variant 서브테이블로 정규화(YAGNI — 컬러별 1행으로 충분).
- 소모품 이미지·재고 수량 관리.

## 7. plan 단계에서 확정할 사항

- 범위 에디터 행 추가 인터랙션 위젯 세부, 장비 검색·선택 컴포넌트 재사용처(P-B에 유사 위젯 있으면 재사용).
- `consumables_for_equipment` 정렬 기준(name vs sku) · 반환 컬럼(scope 출처 표기 포함 여부).
- 목록 "범위 요약" 렌더 형식.
- 마이그레이션 파일 번호(`20260602100005_*` 이후) · 롤백 스크립트(`supabase/rollback/`).

## 8. 결정 로그

- C1. 관계 = M:N **하이브리드 scope**(분류 XOR 장비). 도메인이 분류 단위 공용이라 단순 개별장비 매핑은 누락 위험.
- C2. 매핑 단위 = junction 한 행이 `category` 또는 `equipment_id` 정확히 하나(CHECK). "모든 프린터" = 분류 2행. P-B `company_equipment`의 `equipment_id XOR label` CHECK 패턴 동형.
- C3. 자유텍스트 `category` 취약성 = admin 드롭다운(기존 장비 category distinct)으로 해소. 별도 category 테이블 신설 안 함(YAGNI).
- C4. 권한 = `consumables.manage` 신규 키(P-B `customers.manage` 선례). admin은 `users.manage`로 자동 통과.
- C5. 가격 = 내부 참고용 nullable, 고객·공개 비노출. P-E는 수량만.
- C6. 컬러 = 컬러별 소모품 1행(variant 정규화 안 함).
- C7. 해석 함수 `consumables_for_equipment`를 P-C에서 작성(authenticated). P-E가 anon 노출 여부 별도 결정하며 재사용.
- C8. scope 저장 = id 보존 diff-upsert(P-E item·이력 FK 대비). delete-all-insert 금지.
