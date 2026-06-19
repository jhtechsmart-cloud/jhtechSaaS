# 설계 스펙 — 상태 라벨 변경 · 수기견적 고객연결 · 장비 재고현황

- **작성일:** 2026-06-19
- **한 문장 요약:** 견적 상태 '납품완료'를 '계약완료'로 바꾸고, 수기 견적을 기존 고객에 연결해 고객 이력에 남게 하며, 장비 재고를 관리자가 수기로 관리하는 단일 페이지를 새로 만든다.
- **왜 필요한가 (비전문가용):** ① 영업 용어를 실제 업무(계약)에 맞춤. ② 수기로 만든 견적도 그 고객의 이력에 보이게 해서 "이 고객에게 어떤 견적을 줬는지" 한눈에 추적. ③ 상담 중 "이 장비 지금 재고 있어요?"를 바로 확인.

---

## 변경 1 — 견적 상태 라벨 '납품완료' → '계약완료' (라벨만)

**범위:** 화면 표시 라벨만 변경. 내부 상태 키 `delivered`는 그대로 유지 → DB 마이그레이션 불필요.

**근거:** 라벨은 `apps/web/src/lib/application-status.tsx:43`의 `APPLICATION_STATUS_META.delivered.label` 한 곳이 단일 출처. 색·미수금군(`UNPAID_APPLICATION_STATUSES`)·필터·대시보드 파이프라인·배지는 모두 이 meta/키에서 파생되므로 자동 반영된다.

**수정 파일:**
- `apps/web/src/lib/application-status.tsx:43` — `label: "납품완료"` → `"계약완료"` (색·키 유지)
- `apps/web/src/lib/application-status.test.ts:29` — 단언 `toBe("납품완료")` → `"계약완료"`
- `apps/web/e2e/dashboard.spec.ts:45` — 파이프라인 라벨 배열의 "납품완료" → "계약완료"
- 관련 주석(파생 셋 설명 등)은 의미 보존 위해 "계약완료(구 납품완료)"로 갱신

**건드리지 않음:**
- 견적의 "납품일/납품 일정"(`delivery_date`·`setQuoteDeliveryAction`) — 별개 기능
- 상태 키 `delivered`, DB CHECK, zod enum, 타입 — 키 불변이라 변경 없음
- `UnpaidDeliveries` 컴포넌트 파일명(사용자 비노출). 위젯 내부에 "납품" 표기 카피가 있으면 "미수금"/"계약완료" 문맥으로만 점검

**테스트:** 기존 단위/e2e 단언 갱신으로 충분(신규 로직 없음).

---

## 변경 2+3 — 수기 견적을 기존 고객에 연결 (이력 표시 포함)

### 문제 정의
현재 `create_manual_quote` RPC는 회사명·대표·연락처·이메일만 텍스트로 저장하고 **고객(회사)과의 연결 정보를 저장하지 않는다.** 고객 이력 RPC `get_company_request_history`는 견적(applications)을 **`biz_no` 정규화 매칭 또는 `companies.source_application_id`** 로만 찾는다. 따라서 수기 견적은 어느 쪽도 안 걸려 고객 이력에 안 뜬다. 이관 고객 중 일부는 `biz_no`가 없어(`companies.biz_no` nullable) biz_no 매칭만으론 불충분하다.

### 해결: `applications.company_id` 연결
견적 application을 고객 회사에 직접 연결하는 nullable FK를 추가하고, 이력 RPC가 이를 매칭하게 한다.

**DB 마이그레이션** (`supabase/migrations/<ts>_applications_company_link.sql` + 롤백):
- `applications`에 `company_id uuid` 추가, `references public.companies(id) on delete set null`
- `applications_enforce_server_fields()` 트리거에 `company_id` 생성시 확정·UPDATE 불변 추가(공개폼 의뢰는 null, 수기/연결만 값) — 단 회사 등록(upsert) 흐름과 충돌 없게 검토. (회사 삭제 시 SET NULL로 견적 행은 보존)
- 인덱스 `create index on public.applications (company_id)` (이력 조회·역참조)
- `get_company_request_history` RPC를 `create or replace`로 갱신: 견적 매칭 조건에 `OR a.company_id = p_company_id` 추가 (biz_no/source/company_id 합집합)

**RPC `create_manual_quote` 갱신** (같은/후속 마이그레이션):
- 시그니처에 `p_company_id uuid default null` 추가 (오버로드 아닌 `create or replace` — 인자 추가는 시그니처 변경이므로 기존 함수 `drop` 후 재생성, revoke/grant 재적용)
- `p_company_id`가 있으면: ① `has_permission(quotes.write)` 이미 체크 ② 해당 회사 존재 검증 ③ application INSERT에 `company_id` 저장. (회사명 등 텍스트 필드는 그대로 폼 값 사용 — 표시 스냅샷)
- ⚠️ `_quote_insert`/`create_quote`(의뢰 기반)는 변경 없음. 수기 경로만.

**web 스키마/액션:**
- `apps/web/src/lib/quotes/schema.ts` — `createManualQuotePayloadSchema`에 `companyId: z.guid().optional()` 추가 (⚠️ Zod `z.object`는 미정의 키 strip → 명시 필수)
- `apps/web/src/lib/quotes/actions.ts` `createManualQuoteAction` — `p_company_id: v.companyId ?? null` 전달

### 변경 2 — 고객상세 → 수기견적 프리필
- `CustomerHeader.tsx:76`, `CustomerActivityTabs.tsx:111`의 "새 견적" 링크 → `/admin/quotes/new?company=<companyId>`
- `apps/web/src/app/admin/quotes/new/page.tsx`(서버 컴포넌트): `searchParams.company`가 유효 guid면 `getCompany(id)`로 회사 조회 → 회사명·대표·연락처(phone/mobile 중 대표 연락처)·이메일 + `companyId`를 `ManualQuoteForm`의 초기값 prop으로 주입. 미존재/권한없음이면 프리필 없이 빈 폼(폴백).

### 변경 3 — 수기견적 내 고객 검색
- `ManualQuoteForm.tsx` 상단에 "기존 고객 불러오기" 검색 UI(상호/사업자번호/담당자 입력 → 결과 목록 → 선택)
- 검색은 기존 고객 검색 인프라 재사용: `companies` 목록 검색 RPC/쿼리(`fetchCustomers` 또는 `searchApplicationsForCustomer` 계열) 중 회사 검색에 맞는 것 사용. 필요 시 가벼운 신규 서버 액션 `searchCompaniesForQuote(query)` (customers.view_all 또는 quotes.write 가드, 상호/biz_no/담당자 LIKE, 상위 N건, 회사 4필드+id 반환)
- 선택 시: 회사 4필드 + `companyId` 채움. "직접 입력" 버튼으로 연결 해제(빈 회사 신규 견적).
- 초기 prop(변경 2)으로 들어온 경우에도 동일 상태로 표시(이미 선택된 고객).

**프리필 상태 관리:** `ManualQuoteForm`은 `"use client"` — 초기값은 서버가 prop으로 주입(localStorage 금지 규칙 준수). 검색 선택은 클라 상태.

**테스트:**
- db-tests: `create_manual_quote(p_company_id)` 저장 → `applications.company_id` 세팅 확인 / `get_company_request_history`가 company_id 매칭 견적을 반환(biz_no 없는 회사 포함) / 존재 안 하는 company_id 거부
- web 단위: 스키마에 companyId 보존, 액션 전달, 검색 결과→폼 상태 매핑 순수 로직
- e2e: 고객상세 "새 견적" → 폼 프리필 확인 / 수기견적 검색→선택→저장→고객 이력에 표시

---

## 변경 4 — 장비 재고현황 페이지 (신규)

### 데이터 모델 — 신규 테이블 `equipment_inventory`
별도 테이블(장비 1:1). 미래 창고 재고 연동·이력 확장 시 카탈로그 테이블을 안 건드림.

**마이그레이션** (`supabase/migrations/<ts>_equipment_inventory.sql` + 롤백):
```sql
create table public.equipment_inventory (
  equipment_id uuid primary key references public.equipment(id) on delete cascade,
  stock_qty    int  not null default 0 check (stock_qty >= 0),
  restock_date date,                       -- 입고예정일(재고 0일 때 안내용), nullable
  note         text,                       -- 메모, 길이 캡
  updated_at   timestamptz not null default now(),  -- 서버 통제(트리거)
  updated_by   uuid references public.profiles(id),  -- 수정자(서버 통제)
  constraint equipment_inventory_note_len check (note is null or char_length(note) <= 500)
);
```
- BEFORE INSERT/UPDATE 트리거: `updated_at := now()`, `updated_by := auth.uid()` 강제(클라 입력 무시) — 기존 서버통제값 트리거 패턴 재사용
- RLS enable + 4종 정책:
  - SELECT: 콘솔 자격자(authenticated 중 has_permission `equipment.manage`) — 일관성 위해 equipment 테이블 SELECT 정책과 동일 범위(authenticated 전원 조회) 채택
  - INSERT/UPDATE/DELETE: `has_permission(auth.uid(), 'equipment.manage')`
- 권한은 기존 `equipment.manage` 재사용(신규 capability 안 만듦)

### 페이지 `/admin/inventory` (단일 페이지)
- 서버 컴포넌트: 활성 장비 전체(`equipment status='active'`) + `equipment_inventory` LEFT JOIN(재고행 없으면 0/미설정 표시). 대분류(`equipment_category`)로 그룹 헤더.
- 행 표시: 장비명·모델 / 재고수량(입력) / 상태배지(수량>0=재고있음, 0=품절 — 파생) / 입고예정일(품절 시 입력) / 메모 / 최종수정(시각+수정자명)
- 클라 컴포넌트 `InventoryTable`: 행 단위 인라인 편집 + 저장. 미세 변경만 보내는 diff 불필요(행 단위 upsert).
- 서버 액션 `upsertInventoryAction(equipmentId, {stockQty, restockDate, note})`:
  - `requireEquipmentManage()` 가드 + `z.guid()` + Zod(수량≥0, date 정규식, note 길이)
  - `supabase.from('equipment_inventory').upsert({...}, { onConflict: 'equipment_id' })` (PK라 ON CONFLICT 정상 — 부분 UNIQUE 아님)
  - 입고예정일은 수량>0이면 무의미 → 서버에서 수량>0일 때 null 처리(또는 보존, 정책 단순화: 그대로 저장하되 화면은 품절일 때만 노출)
  - `revalidatePath('/admin/inventory')`

### 사이드바
- `apps/web/src/app/admin/layout.tsx`의 nav `items`에 카탈로그 섹션 추가: `{ href: "/admin/inventory", label: "재고현황", icon: <적절한 아이콘>, show: can(perms, "equipment.manage"), section: "카탈로그" }`
- 아이콘: 기존 Icon 세트에서 박스/창고류 선택(없으면 추가)

**테스트:**
- db-tests: equipment.manage 보유자만 upsert 성공 / 미보유 차단 / updated_by·updated_at 트리거 강제(클라 위조 무시) / stock_qty 음수 거부 / RLS SELECT 범위
- web 단위: 재고 상태 파생(qty>0→재고있음/0→품절) 순수 함수, upsert 액션 입력검증
- e2e: 사이드바 "재고현황" 진입 → 수량 입력·저장 → 반영 / 권한 없는 사용자 차단

---

## 영향도 / 게이트
- 변경 1: DB 무변경. 단위+e2e 단언 갱신.
- 변경 2+3: 마이그레이션 2건(company_id, create_manual_quote 재정의)+롤백. RPC 2개 갱신. db-tests·web·e2e.
- 변경 4: 마이그레이션 1건+롤백. 신규 페이지·액션·사이드바. db-tests·web·e2e.
- 머지 전 게이트: `shared test`·`web test`·`db-tests test:rls`·`web typecheck`·`lint`·`build`·`web test:e2e`·`as any` 0. db-tests/e2e는 클린 `db reset`+`seed-local` 후.
- ⚠️ `create_manual_quote` 시그니처 변경 = 기존 함수 `drop` 후 재생성(인자 추가). revoke/grant 재적용 잊지 말 것.
- ⚠️ `get_company_request_history`·`create_manual_quote` 재정의는 **최신 마이그레이션 정의 기준**으로 갱신(중간 버전 회귀 방지).

## 커밋/PR 구조
원자 커밋 3묶음(`feat:`/`fix:`): (1) 상태 라벨, (2) 수기견적 고객연결, (3) 재고현황. 한 브랜치에서 진행하고 ship 시 분리 여부 판단.
