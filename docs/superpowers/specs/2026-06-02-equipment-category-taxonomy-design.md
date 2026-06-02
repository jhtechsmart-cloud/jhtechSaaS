# Design: 장비 분류 체계(taxonomy) + 소모품 범위 개편

- 작성: 2026-06-02 / 오너: 조선제
- 상태: APPROVED (brainstorm)
- 관련 이슈: #21(P-C 소모품 카탈로그) 확장. equipment(E2) 도메인 변경 포함.
- 선행: E1·E2(equipment 라이브), P-C 소모품 카탈로그(현 브랜치 `feat/pc-consumables-catalog`, 미배포)
- 배경: P-C QA에서 자유텍스트 `equipment.category`의 약점(오타·동의어 분산) 확인. 소모품 공통 매핑이 분류 단위로 안 묶임. 관리형 분류 체계로 전환한다.

## 1. 개요 / 북극성

`equipment.category`(자유텍스트)를 **관리형 2단계 분류 체계**로 전환한다. 대분류(프린터·커팅기)와 소분류(UV프린터·솔벤트프린터…)를 admin이 미리 정의하고, 장비 등록 시 드롭다운으로만 선택한다. 소모품 적용 범위도 자유텍스트 분류 대신 이 분류 노드(대분류=공통 / 소분류 / 특정 장비)를 가리킨다.

핵심 효과: 오타·동의어 분산 제거, "프린터 공통/커팅기 공통" 소모품을 대분류 한 줄로 매핑(하위 전 소분류 자동 커버).

설계 원칙은 기존과 동일: 단일테넌트, capability 권한 + 전 테이블 RLS, 서버통제값 트리거 불변, 자식행 id 보존 diff-upsert.

### 도메인 근거 (사용자 확인)
- 대분류 = 프린터, 커팅기. 소분류(프린터 하위) = UV프린터, 솔벤트프린터. 커팅기는 소분류 없이 단독 가능.
- 세정액·와이퍼 = 프린터 공통(대분류 프린터). UV잉크 = UV프린터(소분류). 칼날·매트·필터·브러쉬 = 커팅기 공통(대분류 커팅기). 특정 모델 전용 부품 = 특정 장비.
- 범위 미지정 소모품은 어떤 장비에도 매칭 안 됨(명시적). 전체 공통은 대분류 여러 행으로 명시.

## 2. 데이터 모델

> 모든 도메인 테이블 RLS 필수. 서버통제값(created_at·updated_at)은 트리거 불변(기존 패턴 재사용).

### 2.1 `equipment_category` (신규, self-ref 2단계)

```
id           uuid pk default gen_random_uuid()
parent_id    uuid references public.equipment_category(id) on delete restrict  -- null=대분류, 값=소분류
name         text not null                          -- char_length ≤ 100
sort_order   int not null default 0
created_at   timestamptz not null default now()     -- 트리거 불변
updated_at   timestamptz not null default now()     -- 트리거 갱신
constraint equipment_category_name_len check (char_length(name) <= 100)
```
- 유일성: 같은 부모 아래 동명 금지 + 대분류끼리 동명 금지.
  - 부분 UNIQUE `(parent_id, name) WHERE parent_id is not null` (소분류)
  - 부분 UNIQUE `(name) WHERE parent_id is null` (대분류)
- **2단계 강제**: 부모로 지정된 노드는 자신이 대분류여야(손자 금지). BEFORE INSERT/UPDATE 트리거에서 `parent_id`가 가리키는 행의 `parent_id`가 null인지 검증, 아니면 raise.
- index: `(parent_id)`, `(sort_order)`.
- RLS 4정책: SELECT=`authenticated true`, INS/UPD/DEL=`has_permission(uid,'equipment.manage')`.
- `on delete restrict`: 자식(소분류)·참조(equipment·consumable_scope) 있는 노드 삭제 차단 → admin이 먼저 비워야.

### 2.2 `equipment` 변경 (라이브 테이블 — ALTER 마이그레이션)

- `category text` 제거 → `category_id uuid references public.equipment_category(id) on delete restrict`. (사용 중인 분류 삭제 차단 — admin이 먼저 재배정)
- **부착 규칙(앱 강제)**: 자식이 있는 대분류엔 직접 부착 금지(소분류 선택). 자식 없는 대분류(예 커팅기)는 직접 부착 허용. DB는 FK만, 규칙은 admin 폼·서버액션 검증.
- **데이터 마이그레이션**(보존):
  1. 기존 `equipment`의 distinct non-null `category` 텍스트마다 **대분류 노드 생성**(parent_id null).
  2. 각 equipment의 `category_id`를 위 노드로 매핑. `category` null인 행은 `category_id` null.
  3. `category` 컬럼 drop.
  - ⚠️ 대분류/소분류 구조 묶기·소분류 정리·오타 병합은 마이그레이션이 추측하지 않고 **admin에서 사용자가 직접**(결정②).
- **`equipment_public` 공개뷰 재생성**: `category` 텍스트 대신 `equipment_category` 조인으로 분류명(`category`) 노출 유지(anon 카탈로그 호환). 뷰는 P-A에서 `category` 포함 → drop + recreate.

### 2.3 `consumable_scope` 변경 (현 브랜치, 미배포라 직접 수정)

- `category text` 제거 → `category_id uuid references public.equipment_category(id) on delete restrict`. (분류 삭제 시 매핑 보호 — 참조 차단. consumable 삭제 시 scope cascade는 `consumable_id` FK가 별도 담당)
- CHECK: `(category_id is not null) <> (equipment_id is not null)` (분류 XOR 장비).
- 부분 UNIQUE: `(consumable_id, category_id) WHERE category_id is not null`, `(consumable_id, equipment_id) WHERE equipment_id is not null`.
- index: `(consumable_id)`, `(equipment_id)`, `(category_id)`.
- 트리거·RLS는 기존 동일. (이 브랜치 P-C 마이그레이션을 FK 기반으로 재작성)

## 3. 해석 함수 `consumables_for_equipment` 개정

```sql
select distinct cn.*
from public.consumables cn
join public.consumable_scope cs on cs.consumable_id = cn.id
join public.equipment e on e.id = p_equipment_id
where cn.status = 'active'
  and (
    cs.equipment_id = p_equipment_id
    or cs.category_id = e.category_id                         -- 소분류/단독대분류 직접 매칭
    or cs.category_id = (select ec.parent_id from public.equipment_category ec where ec.id = e.category_id)  -- 대분류(공통) 매칭
  );
```
- 대분류 scope("프린터")가 그 하위 소분류(UV·솔벤트) 장비를 모두 커버. 2단계 한정이라 재귀 CTE 불필요.
- `e.category_id`가 null이면 분류 매칭 없음(특정 장비 매핑만).
- SECURITY DEFINER + `search_path=''` + STABLE + **`revoke ... from public, anon` + grant to authenticated**(P-C에서 확립한 함정 회피).

## 4. Admin UI

### 4.1 신규 `/admin/categories` (equipment.manage 게이트)
- 대분류/소분류 **트리 뷰** + CRUD: 대분류 추가, 대분류 아래 소분류 추가, 이름 수정, 정렬, 삭제(참조 있으면 차단·안내).
- 비즈니스 로직(2단계 검증·참조 체크)은 `lib/`에, 컴포넌트는 표시·UX만.
- nav에 "분류"(또는 장비 하위) 진입점 추가.

### 4.2 장비 폼 (E2 admin 변경) — 결정①
- `category` 자유 입력 → **분류 드롭다운**: `<optgroup label="대분류">` 안에 소분류 + 자식 없는 대분류. 자식 있는 대분류는 헤더로만(선택 비활성).
- 서버액션: 선택 노드가 "자식 있는 대분류"면 거부(소분류 선택 강제).

### 4.3 소모품 scope 에디터 (P-C 변경)
- 분류 모드: 자유텍스트 distinct → **taxonomy 드롭다운**(optgroup: 대분류=공통 표기 / 소분류). 장비 모드 유지.
- 폼 값: `scopes[].category` (텍스트) → `scopes[].category_id` (uuid). 스키마·diff·actions·해석 매핑 동기화.

## 5. 범위 미지정 = 명시적
- scope 0건 = 매칭 0(현행 유지). 전체 공통 = 대분류(프린터·커팅기) 각 행으로 명시. "미지정=전체" 안 함(반쯤 설정된 소모품의 전체 오매칭 방지).

## 6. 마이그레이션 순서 (결정③)

현 브랜치 미배포 마이그레이션 재배치 + 라이브 위 신규 ALTER:
- 라이브(수정 금지): `..._equipment.sql`(E1, category text 보유), P-B 100001~100004, P-C `100005_consumables.sql`.
- **신규/수정**(이 브랜치):
  1. `20260602100006_equipment_category.sql` — taxonomy 테이블 + 트리거 + RLS.
  2. `20260602100007_equipment_category_migrate.sql` — equipment에 `category_id` 추가 → 기존 category 텍스트를 대분류 노드로 보존 생성·매핑 → `category` drop → `equipment_public` 뷰 재생성.
  3. `20260602100008_consumable_scope.sql` — (기존 100006 재작성) `category_id` FK 기반.
  4. `20260602100009_consumables_for_equipment.sql` — (기존 100007 재작성) 해석 함수 개정.
  - 기존 P-C `100006`·`100007` 파일은 위 번호로 재작성/이동(미배포라 안전). consumables(100005)는 그대로.
- 각 마이그레이션 롤백 스크립트는 `supabase/rollback/`(단수).
- ⚠️ equipment.category(라이브) 전환은 데이터 이전 마이그레이션 → 머지 후 `supabase db push` 전 로컬 `db reset`으로 전 과정 검증 필수.

## 7. 테스트

- **db-tests(RLS)**:
  - equipment_category: equipment.manage 게이트, 2단계 CHECK(손자 거부), 부분 UNIQUE(대분류 동명·소분류 동명 거부), on delete restrict(참조 노드 삭제 차단).
  - equipment: category_id FK, 마이그레이션 후 기존 분류 텍스트가 노드로 보존되는지(이전 검증).
  - consumable_scope: category_id XOR equipment_id, FK, cascade.
  - `consumables_for_equipment`: 대분류 scope→하위 소분류 장비 커버, 소분류 scope→해당만, 단독 대분류(커팅기), 특정 장비, dedup, active 필터.
  - ⚠️ `supabase db reset` 후 실행.
- **순수(Vitest)**: 분류 드롭다운 optgroup 구성(대분류 그룹·자식없는대분류 선택가능 판정), 폼 스키마(category_id), scope diff(category_id).
- **E2E**: 분류 CRUD(대분류·소분류 추가), 장비 폼 분류 드롭다운 선택·저장, 소모품 대분류 scope 저장→해당 대분류 전 장비 매칭(해석 결과), 403.

## 8. Out of scope (후속)
- 3단계 이상 분류(현 2단계로 충분).
- 소분류별 아이콘·이미지.
- 기존 P-A 그룹사양(specs jsonb)과 분류 연동.
- #29(admin layout equipment.manage 하드게이트) 정리 — 별도 백로그.

## 9. 결정 로그
- T1. 분류 구조 = 2단계 관리형 self-ref(대분류 parent null / 소분류 parent 있음). 사용자 "프린터 공통/커팅기 공통" 요구에 부합.
- T2. 장비 부착 = 자식 있는 대분류 직접 부착 금지(소분류 선택), 자식 없는 대분류는 허용(커팅기 단독). 앱 강제.
- T3. 범위 미지정 = 명시적(매칭 0). 전체공통 = 대분류 여러 행.
- T4. 적용 시점 = 현 P-C 브랜치에 함께 포함해 1회 ship(자유텍스트 scope 재작업 회피).
- T5. 마이그레이션 = 기존 분류 텍스트를 대분류 노드로 보존 생성, 구조 정리는 admin. 추측 시드 안 함.
- T6. equipment.category(라이브)는 ALTER 신규 마이그레이션으로 전환(E1 원본 수정 금지). 이 브랜치 P-C scope/함수 마이그레이션은 FK 기반 재작성.
- T7. 분류 관리 권한 = equipment.manage 재사용(분류는 장비 도메인). 신규 capability 없음.
