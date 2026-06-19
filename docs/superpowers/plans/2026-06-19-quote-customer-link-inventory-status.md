# 상태 라벨·수기견적 고객연결·재고현황 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 상태 '납품완료'→'계약완료' 라벨 변경, 수기 견적을 기존 고객(company_id)에 연결해 이력에 노출, 장비 재고를 관리자가 수기 관리하는 `/admin/inventory` 단일 페이지 신설.

**Architecture:** ① 라벨은 단일출처 meta 값만 변경(키 불변, DB 무변경). ② `applications.company_id` nullable FK 추가 + `create_manual_quote`/`get_company_request_history` RPC 갱신으로 수기견적-고객 연결. ③ 신규 `equipment_inventory`(장비 1:1) 테이블 + equipment.manage RLS + upsert 액션 + 단일 페이지.

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres RPC/RLS), TypeScript, Zod, Vitest, Playwright, pg(db-tests).

## Global Constraints

- 단일 테넌트 — tenant_id 없음. 권한 = capability(`has_permission`).
- 모든 도메인 테이블 RLS 필수 + SELECT/INSERT/UPDATE/DELETE 정책. SECURITY DEFINER는 `set search_path = ''` + anon/public revoke.
- 서버 통제값(updated_at/updated_by/company_id 등)은 BEFORE 트리거로 강제(service_role도 우회 불가).
- `as any` 0건. 컴포넌트 비즈로직 직접 작성 금지(`lib/`로). 주석 한국어.
- 마이그레이션 롤백은 `supabase/rollback/<ts>_<name>_down.sql`(단수 디렉토리).
- 부분 UNIQUE는 `ON CONFLICT` arbiter 미작동 — `equipment_inventory`는 PK(equipment_id)라 `ON CONFLICT(equipment_id)` 정상.
- Zod `z.object`는 미정의 키 strip → 새 필드는 스키마에 명시.
- 게이트: `shared test`·`web test`·`db-tests test:rls`·`web typecheck`·`lint`·`build`·`web test:e2e` + `as any` 0. db-tests/e2e는 클린 `supabase db reset` + `bash supabase/seed/seed-local.sh` 후.
- 커밋 prefix: `feat:`/`fix:`. 커밋 메시지 트레일러(Co-Authored-By + Claude-Session) 부착.

---

## Phase A — 상태 라벨 '납품완료' → '계약완료'

### Task A1: 라벨 변경 + 테스트 단언 갱신

**Files:**
- Modify: `apps/web/src/lib/application-status.tsx:43`
- Modify: `apps/web/src/lib/application-status.test.ts:29`
- Modify: `apps/web/e2e/dashboard.spec.ts:45`

**Interfaces:**
- Produces: `APPLICATION_STATUS_META.delivered.label === "계약완료"` (키 `delivered` 불변).

- [ ] **Step 1: 테스트 단언 먼저 변경(실패 유도)** — `application-status.test.ts:29`의 `expect(APPLICATION_STATUS_META.delivered.label).toBe("납품완료")` → `toBe("계약완료")`.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- application-status` / Expected: FAIL (`expected "납품완료" to be "계약완료"`).

- [ ] **Step 3: 라벨 구현** — `application-status.tsx:43` `label: "납품완료"` → `label: "계약완료"`. 같은 줄 주석 `// 파랑 — 납품(...)` → `// 파랑 — 계약완료(구 납품완료, 캘린더색 유지)`.

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test -- application-status` / Expected: PASS.

- [ ] **Step 5: e2e 라벨 배열 갱신** — `dashboard.spec.ts:45` 배열의 `"납품완료"` → `"계약완료"`.

- [ ] **Step 6: 주석 정합성** — `application-status.tsx`의 파생셋 주석(`UNPAID_APPLICATION_STATUSES` 등)·`UnpaidDeliveries.tsx`·`dashboard/unpaid.ts` 주석에서 사용자 비노출 주석은 "계약완료(구 납품완료)"로 가볍게 갱신(코드 로직 무변경). 화면 출력 카피에 "납품완료" 잔존 없는지 `grep -rn "납품완료" apps/web/src` 확인(주석/테스트만 남아야).

- [ ] **Step 7: 커밋**
```bash
git add apps/web/src/lib/application-status.tsx apps/web/src/lib/application-status.test.ts apps/web/e2e/dashboard.spec.ts apps/web/src/app/admin/dashboard/_components/UnpaidDeliveries.tsx apps/web/src/lib/dashboard/unpaid.ts
git commit -m "fix: 견적 상태 라벨 '납품완료'→'계약완료' (키 delivered 불변, DB 무변경)"
```

---

## Phase B — 수기 견적 고객 연결 (#2 + #3)

### Task B1: 마이그레이션 — `applications.company_id` FK + 트리거 + 인덱스

**Files:**
- Create: `supabase/migrations/20260619140000_applications_company_link.sql`
- Create: `supabase/rollback/20260619140000_applications_company_link_down.sql`

**Interfaces:**
- Produces: `applications.company_id uuid` (nullable, FK→companies, ON DELETE SET NULL), 생성시 확정·UPDATE 불변. `applications(company_id)` 인덱스.

- [ ] **Step 1: 마이그레이션 작성** — 최신 `applications_enforce_server_fields()` 정의를 기준으로 `create or replace` (source 불변 유지 + company_id 불변 추가).
```sql
-- 수기 견적·고객연결용 company_id. 공개폼 의뢰는 null, 수기/연결 경로만 값.
alter table public.applications
  add column company_id uuid references public.companies(id) on delete set null;
create index applications_company_idx on public.applications (company_id);

-- 서버통제값 트리거 갱신: company_id 생성시 확정, UPDATE 불변(감사).
-- ⚠️ 최신 정의(20260605120000 assignee_propagation 이후) 기준으로 재작성할 것.
create or replace function public.applications_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_application_seq_no();
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
    new.source := old.source;
    new.company_id := old.company_id;  -- 생성 시점 확정값, 이후 변조 불가
  end if;
  return new;
end;
$$;
```
  ⚠️ 위 함수 본문은 **반드시 현재 DB의 최신 정의를 먼저 확인**(`supabase/migrations/`에서 마지막 `applications_enforce_server_fields` 정의)하고 누락 컬럼 없이 복사 후 company_id만 추가. (회귀 방지)

- [ ] **Step 2: 롤백 작성** — `_down.sql`: `drop index applications_company_idx; alter table public.applications drop column company_id;` + 트리거 함수를 직전 정의로 복원.

- [ ] **Step 3: 적용 확인** — Run: `supabase db reset` / Expected: 에러 없이 전 마이그레이션 적용.

- [ ] **Step 4: 커밋**
```bash
git add supabase/migrations/20260619140000_applications_company_link.sql supabase/rollback/20260619140000_applications_company_link_down.sql
git commit -m "feat: applications.company_id 연결 컬럼 + 불변 트리거 + 인덱스"
```

### Task B2: 마이그레이션 — `create_manual_quote(p_company_id)` + `get_company_request_history` 갱신

**Files:**
- Create: `supabase/migrations/20260619140100_manual_quote_company_link.sql`
- Create: `supabase/rollback/20260619140100_manual_quote_company_link_down.sql`

**Interfaces:**
- Consumes: `applications.company_id` (B1).
- Produces: `create_manual_quote(p_company text, p_ceo text, p_phone text, p_email text, p_items jsonb, p_options jsonb, p_status text, p_company_id uuid)` — 인자 추가. `get_company_request_history`가 `a.company_id = p_company_id`도 매칭.

- [ ] **Step 1: 마이그레이션 작성** — 시그니처 변경이므로 기존 함수 `drop` 후 재생성(인자 추가). 최신 `create_manual_quote`(20260619100200 spec_selection 반영본)·`get_company_request_history` 정의 기준.
```sql
-- create_manual_quote: p_company_id(선택) 추가 → application.company_id 저장.
-- ⚠️ 인자 추가 = 새 시그니처. 기존 함수 drop 후 최신 정의(spec_selection 포함)에 company_id 로직만 추가.
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, text[]);
-- (실제 최신 시그니처를 마이그레이션에서 확인 후 정확히 drop)

create or replace function public.create_manual_quote(
  p_company text, p_ceo text, p_phone text, p_email text,
  p_items jsonb, p_options jsonb, p_status text default 'draft',
  p_spec_selection text[] default '{}', p_company_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_app_id uuid; v_row public.quotes;
begin
  if not public.has_permission(auth.uid(), 'quotes.write') then
    raise exception '견적 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if v_company is null then raise exception '회사명은 필수입니다'; end if;
  if p_company_id is not null
     and not exists (select 1 from public.companies where id = p_company_id) then
    raise exception '존재하지 않는 고객입니다';
  end if;
  insert into public.applications (company, ceo, phone, email, source, status, assignee_id, company_id)
  values (v_company, nullif(btrim(coalesce(p_ceo,'')),''), nullif(btrim(coalesce(p_phone,'')),''),
          nullif(btrim(coalesce(p_email,'')),''), 'manual', 'quoted', auth.uid(), p_company_id)
  returning id into v_app_id;
  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status, p_spec_selection);
  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end; $$;
revoke all on function public.create_manual_quote(text,text,text,text,jsonb,jsonb,text,text[],uuid) from public, anon;
grant execute on function public.create_manual_quote(text,text,text,text,jsonb,jsonb,text,text[],uuid) to authenticated;
```
  ⚠️ `_quote_insert` 시그니처(spec_selection 포함 여부)를 최신 마이그(20260619100200)에서 확인해 정확히 호출.
```sql
-- get_company_request_history: 견적 매칭에 company_id OR 추가.
-- 최신 정의(20260618 라이프사이클 이후) 기준으로 create or replace, applications where절에
--   (v_biz is not null and ... = v_biz) OR (a.id = v_source) OR (a.company_id = p_company_id)
```

- [ ] **Step 2: 롤백 작성** — `_down.sql`: 새 시그니처 함수 drop + 직전 시그니처 `create_manual_quote`(company_id 없는 버전) 재생성, `get_company_request_history` 직전 정의 복원.

- [ ] **Step 3: 적용 확인** — Run: `supabase db reset` / Expected: 정상.

- [ ] **Step 4: 커밋**
```bash
git add supabase/migrations/20260619140100_manual_quote_company_link.sql supabase/rollback/20260619140100_manual_quote_company_link_down.sql
git commit -m "feat: create_manual_quote에 company_id 연결 + 이력 RPC company_id 매칭"
```

### Task B3: db-tests — 수기견적 고객연결·이력 표시

**Files:**
- Modify: `packages/db-tests/src/quote_create_rpc.test.ts` (또는 신규 `manual_quote_company_link.test.ts`)
- Test: `packages/db-tests/src/manual_quote_company_link.test.ts`

**Interfaces:**
- Consumes: `create_manual_quote(...p_company_id)`, `get_company_request_history(p_company_id)`.

- [ ] **Step 1: 실패 테스트 작성** — (a) p_company_id 지정 시 `applications.company_id` 세팅 (b) `get_company_request_history`가 그 견적을 applications에 포함(biz_no 없는 company 포함) (c) 존재 안 하는 company_id → exception. helpers.ts의 `setRole`/jwt 패턴 재사용.
```ts
// 의사 코드 — 실제는 helpers.ts 패턴 사용
it("p_company_id로 만든 수기견적이 고객 이력에 뜬다(biz_no 없어도)", async () => {
  // company(biz_no null) 생성 → create_manual_quote(..., p_company_id=company.id)
  // → applications.company_id = company.id 확인
  // → get_company_request_history(company.id).applications 에 해당 seq_no 포함
});
```

- [ ] **Step 2: 실패 확인** — Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests test:rls -- manual_quote` / Expected: FAIL.

- [ ] **Step 3: (구현은 B1·B2에서 완료)** — 테스트가 RPC 동작을 검증. 실패 시 마이그 수정.

- [ ] **Step 4: 통과 확인** — Run 위 동일 / Expected: PASS.

- [ ] **Step 5: 커밋** — `git commit -m "test: 수기견적 company_id 연결·이력 표시 db-tests"`

### Task B4: web 스키마·액션 — companyId 전달

**Files:**
- Modify: `apps/web/src/lib/quotes/schema.ts:17-24`
- Modify: `apps/web/src/lib/quotes/actions.ts:148-179` (`createManualQuoteAction`)
- Test: `apps/web/src/lib/quotes/schema.test.ts`

**Interfaces:**
- Produces: `createManualQuotePayloadSchema`에 `companyId?: string`(guid). `createManualQuoteAction`가 `p_company_id` 전달.

- [ ] **Step 1: 스키마 테스트(실패)** — `schema.test.ts`에 "companyId(guid) 보존, 미지정 허용" 케이스 추가.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- quotes/schema` / Expected: FAIL.

- [ ] **Step 3: 스키마 구현** — `createManualQuotePayloadSchema`에 `companyId: z.guid().optional()` 추가.

- [ ] **Step 4: 액션 구현** — `createManualQuoteAction`의 `supabase.rpc("create_manual_quote", {...})` 호출에 `p_company_id: v.companyId ?? null` 추가.

- [ ] **Step 5: 통과 확인** — Run: `pnpm --filter web test -- quotes/schema` / Expected: PASS.

- [ ] **Step 6: 커밋** — `git commit -m "feat: 수기견적 액션·스키마에 companyId 추가"`

### Task B5: 고객 검색 서버 액션 — `searchCompaniesForQuote`

**Files:**
- Create: `apps/web/src/lib/quotes/customer-search.ts` (`"use server"` 아님 — 서버 함수는 actions에)
- Modify: `apps/web/src/lib/quotes/actions.ts` (export `searchCustomersForQuoteAction`)
- Test: `apps/web/src/lib/quotes/customer-search.test.ts` (순수 매핑/쿼리빌드 로직)

**Interfaces:**
- Produces: `searchCustomersForQuoteAction(query: string): Promise<{ error: string } | QuoteCustomer[]>` where `QuoteCustomer = { id: string; name: string; ceo: string|null; phone: string|null; email: string|null; bizNo: string|null }`. 가드 = `requireQuotesWrite()`. `companies`에서 name/ceo ilike + 숫자 biz_no/phone 매칭, 상위 20건.

- [ ] **Step 1: 쿼리빌드 순수함수 테스트(실패)** — `customer-search.ts`의 `buildCompanySearchOr(q)` 순수함수(특수문자 제거 + name/ceo ilike + digits 매칭). 빈 쿼리→null, 한글명→ilike, 숫자→biz_no/phone 매칭 케이스.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- customer-search` / Expected: FAIL.

- [ ] **Step 3: 구현** — `buildCompanySearchOr` 순수함수 + `searchCustomersForQuoteAction`(actions.ts): `requireQuotesWrite` 가드 → `companies` select `id,name,ceo,phone,mobile,email,biz_no` `.or(buildCompanySearchOr(q))` `.limit(20)` → `QuoteCustomer[]` 매핑(phone ?? mobile). 미입력/짧은 쿼리는 빈 배열.

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test -- customer-search` / Expected: PASS.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 수기견적용 고객 검색 액션"`

### Task B6: ManualQuoteForm 초기값 prop + 고객 검색 UI

**Files:**
- Modify: `apps/web/src/app/admin/quotes/_components/ManualQuoteForm.tsx`
- Create: `apps/web/src/app/admin/quotes/_components/CustomerPicker.tsx`
- Test: `apps/web/src/lib/quotes/customer-prefill.test.ts` (선택→폼필드 매핑 순수 로직)

**Interfaces:**
- Consumes: `QuoteCustomer` (B5), `createManualQuoteAction`(companyId 포함).
- Produces: `ManualQuoteForm({ catalog, initialCustomer? })` where `initialCustomer?: QuoteCustomer`. 폼 상태에 `companyId: string | null` 추가, 저장 payload에 `companyId` 포함.

- [ ] **Step 1: 프리필 매핑 순수함수 테스트(실패)** — `customerToFormFields(c: QuoteCustomer)` → `{ company, ceo, phone, email, companyId }`(phone ?? mobile은 B5에서 이미 phone에 통합). null 안전.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- customer-prefill` / Expected: FAIL.

- [ ] **Step 3: 순수함수 구현** — `customer-prefill.ts`.

- [ ] **Step 4: 폼 통합** — `ManualQuoteForm`에 `initialCustomer` prop + `companyId` 상태(초기값 prop). 상단에 `CustomerPicker`(검색 입력 → `searchCustomersForQuoteAction` 호출 → 결과 클릭 시 `customerToFormFields`로 4필드+companyId 세팅, "직접 입력" 버튼으로 companyId=null·필드 유지/초기화). `submit()`의 payload에 `companyId: companyId ?? undefined` 추가. 연결됨 표시(회사명 옆 "고객 연결됨" 배지).

- [ ] **Step 5: 통과 확인** — Run: `pnpm --filter web test -- customer-prefill` / Expected: PASS + `pnpm --filter web typecheck`.

- [ ] **Step 6: 커밋** — `git commit -m "feat: 수기견적 폼 고객 검색·프리필 + companyId 연결"`

### Task B7: 고객상세 → 수기견적 딥링크 + 페이지 프리필

**Files:**
- Modify: `apps/web/src/app/admin/quotes/new/page.tsx`
- Modify: `apps/web/src/app/admin/customers/[id]/_components/CustomerHeader.tsx:76`
- Modify: `apps/web/src/app/admin/customers/[id]/_components/CustomerActivityTabs.tsx:111`

**Interfaces:**
- Consumes: `getCompany(id)` (queries.ts), `ManualQuoteForm`(initialCustomer).

- [ ] **Step 1: 페이지 프리필** — `new/page.tsx`를 `searchParams` 받게(`{ searchParams }: { searchParams: Promise<{ company?: string }> }`, Next16 async). `company` guid면 `getCompany(id)` → `QuoteCustomer`로 변환해 `initialCustomer`로 전달. 미존재/무효면 무시(빈 폼).

- [ ] **Step 2: 고객상세 링크** — `CustomerHeader.tsx:76`·`CustomerActivityTabs.tsx:111`의 `href="/admin/quotes/new"` → `` `/admin/quotes/new?company=${company.id}` `` (각 컴포넌트의 company id 변수명 확인).

- [ ] **Step 3: typecheck** — Run: `pnpm --filter web typecheck` / Expected: PASS.

- [ ] **Step 4: 커밋** — `git commit -m "feat: 고객상세 새 견적→수기견적 프리필 딥링크"`

### Task B8: e2e — 수기견적 고객연결 플로우

**Files:**
- Create: `apps/web/e2e/manual-quote-customer-link.spec.ts`

- [ ] **Step 1: e2e 작성** — service_role REST로 고유 biz_no 회사 시드 → (a) `/admin/quotes/new?company=<id>` 진입 시 회사명 프리필 확인 (b) 수기견적 검색→선택→저장→고객상세 이력에 견적 표시 확인. 기존 `quote-email.spec.ts` 시드 패턴 재사용.

- [ ] **Step 2: 실행** — Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e -- manual-quote-customer-link` / Expected: PASS.

- [ ] **Step 3: 커밋** — `git commit -m "test: 수기견적 고객연결 e2e"`

---

## Phase C — 장비 재고현황 페이지 (#4)

### Task C1: 마이그레이션 — `equipment_inventory` 테이블 + RLS + 트리거

**Files:**
- Create: `supabase/migrations/20260619150000_equipment_inventory.sql`
- Create: `supabase/rollback/20260619150000_equipment_inventory_down.sql`

**Interfaces:**
- Produces: 테이블 `equipment_inventory(equipment_id pk, stock_qty, restock_date, note, updated_at, updated_by)`, RLS 4종, BEFORE 트리거 `equipment_inventory_enforce_server_fields`.

- [ ] **Step 1: 마이그레이션 작성**
```sql
create table public.equipment_inventory (
  equipment_id uuid primary key references public.equipment(id) on delete cascade,
  stock_qty    int  not null default 0 check (stock_qty >= 0),
  restock_date date,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id),
  constraint equipment_inventory_note_len check (note is null or char_length(note) <= 500)
);

create or replace function public.equipment_inventory_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();  -- 클라 입력 무시(서버 강제)
  return new;
end; $$;
create trigger equipment_inventory_server_fields
  before insert or update on public.equipment_inventory
  for each row execute function public.equipment_inventory_enforce_server_fields();

alter table public.equipment_inventory enable row level security;

-- SELECT: authenticated 전원(equipment 테이블 SELECT 정책과 동일 범위)
create policy equipment_inventory_select on public.equipment_inventory
  for select to authenticated using (true);
-- INSERT/UPDATE/DELETE: equipment.manage
create policy equipment_inventory_insert on public.equipment_inventory
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_inventory_update on public.equipment_inventory
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_inventory_delete on public.equipment_inventory
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));
```
  ⚠️ equipment 테이블의 실제 SELECT 정책 범위를 확인(`20260529150003_equipment.sql`)해 일치시킬 것.

- [ ] **Step 2: 롤백** — `drop trigger ...; drop function ...; drop table public.equipment_inventory;`

- [ ] **Step 3: 적용 확인** — Run: `supabase db reset` / Expected: 정상.

- [ ] **Step 4: 커밋** — `git commit -m "feat: equipment_inventory 테이블 + RLS + 서버통제 트리거"`

### Task C2: db-tests — 재고 RLS·트리거

**Files:**
- Create: `packages/db-tests/src/equipment_inventory.test.ts`

- [ ] **Step 1: 실패 테스트** — (a) equipment.manage 보유자 upsert 성공 (b) 미보유 차단 (c) stock_qty 음수 거부 (d) updated_by가 auth.uid()로 강제(클라가 다른 값 줘도 무시) (e) authenticated SELECT 가능. helpers.ts 패턴.

- [ ] **Step 2: 실패 확인** — Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment_inventory` / Expected: FAIL(테이블 없으면 C1 미적용 — 적용 후 RED→GREEN).

- [ ] **Step 3: (구현 C1)** / **Step 4: 통과 확인** — Run 동일 / Expected: PASS.

- [ ] **Step 5: 커밋** — `git commit -m "test: equipment_inventory RLS·트리거 db-tests"`

### Task C3: 재고 조회 쿼리 + 상태 파생 순수함수

**Files:**
- Create: `apps/web/src/lib/inventory/queries.ts`
- Create: `apps/web/src/lib/inventory/status.ts`
- Test: `apps/web/src/lib/inventory/status.test.ts`

**Interfaces:**
- Produces:
  - `stockStatus(qty: number): "in_stock" | "out_of_stock"` (qty>0 → in_stock)
  - `InventoryRow = { equipmentId: string; name: string; model: string|null; category: string|null; stockQty: number; restockDate: string|null; note: string|null; updatedAt: string|null; updatedByName: string|null }`
  - `listInventory(): Promise<InventoryRow[]>` — 활성 장비 LEFT JOIN equipment_inventory(+updated_by profile name), 대분류/이름 정렬.

- [ ] **Step 1: status 순수함수 테스트(실패)** — qty 0→out_of_stock, 1→in_stock.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- inventory/status` / Expected: FAIL.

- [ ] **Step 3: 구현** — `status.ts` 순수함수 + `queries.ts` `listInventory`(server-only; `equipment` status='active' select + `equipment_inventory(*, profiles:updated_by(name))` LEFT JOIN; 재고행 없으면 stockQty 0 매핑).

- [ ] **Step 4: 통과 확인** — Run 동일 / Expected: PASS.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 재고 조회 쿼리 + 재고상태 파생"`

### Task C4: 재고 upsert 서버 액션

**Files:**
- Create: `apps/web/src/lib/inventory/actions.ts`
- Test: `apps/web/src/lib/inventory/actions.test.ts` (입력 검증 스키마 순수 검증)

**Interfaces:**
- Consumes: `requireEquipmentManage()` (guard.ts).
- Produces: `upsertInventoryAction(equipmentId: string, values: { stockQty: number; restockDate: string|null; note: string|null }): Promise<{ error: string } | null>`.

- [ ] **Step 1: 스키마 테스트(실패)** — 수량 음수 거부, 날짜 정규식(YYYY-MM-DD|null), note 길이 ≤500, equipmentId guid.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- inventory/actions` / Expected: FAIL.

- [ ] **Step 3: 구현** — `"use server"`; `requireEquipmentManage()` 가드 → `z.guid()` + Zod(stockQty `z.number().int().min(0)`, restockDate `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()`, note `z.string().max(500).nullable()`) → `supabase.from('equipment_inventory').upsert({ equipment_id, stock_qty, restock_date, note }, { onConflict: 'equipment_id' })` → `revalidatePath('/admin/inventory')`. (updated_at/by는 트리거)

- [ ] **Step 4: 통과 확인** — Run 동일 / Expected: PASS + typecheck.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 재고 upsert 서버 액션"`

### Task C5: 재고현황 페이지 + 테이블 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/inventory/page.tsx`
- Create: `apps/web/src/app/admin/inventory/_components/InventoryTable.tsx`
- Create: `apps/web/src/app/admin/inventory/loading.tsx`, `error.tsx`

**Interfaces:**
- Consumes: `listInventory`, `upsertInventoryAction`, `requireEquipmentManage`, `stockStatus`.

- [ ] **Step 1: 페이지(서버)** — `requireEquipmentManage()` 가드(forbidden 패널) → `listInventory()` → 대분류 그룹 헤더 + `<InventoryTable rows=... />`. 제목 "재고현황".

- [ ] **Step 2: InventoryTable(클라)** — 행마다 장비명·모델 / 재고수량 input(number) / 상태배지(`stockStatus`) / 입고예정일 input(품절 시 강조) / 메모 input / 최종수정(시각+수정자) / 저장 버튼(행 단위 `upsertInventoryAction`, sonner 토스트). 디자인은 DESIGN.md(mono tabular 숫자) 준수.

- [ ] **Step 3: typecheck/lint** — Run: `pnpm --filter web typecheck && pnpm --filter web lint` / Expected: PASS(경고 외 에러 0).

- [ ] **Step 4: 커밋** — `git commit -m "feat: 재고현황 페이지 + 인라인 편집 테이블"`

### Task C6: 사이드바 메뉴 추가

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx:55-80` (nav items 배열)
- Modify: `apps/web/src/app/admin/_components/Icon.tsx` (필요 시 박스/창고 아이콘 추가)

**Interfaces:**
- Consumes: `can(perms, "equipment.manage")`.

- [ ] **Step 1: 아이콘 확인/추가** — `Icon.tsx`에 재고용 아이콘(box/package) 있으면 재사용, 없으면 추가.

- [ ] **Step 2: nav 추가** — items 배열 카탈로그 섹션에 `{ href: "/admin/inventory", label: "재고현황", icon: "<box>", show: can(perms, "equipment.manage"), section: "카탈로그" }`.

- [ ] **Step 3: typecheck** — Run: `pnpm --filter web typecheck` / Expected: PASS.

- [ ] **Step 4: 커밋** — `git commit -m "feat: 사이드바 재고현황 메뉴"`

### Task C7: e2e — 재고현황

**Files:**
- Create: `apps/web/e2e/inventory.spec.ts`

- [ ] **Step 1: e2e** — admin 로그인 → 사이드바 "재고현황" 클릭 → `/admin/inventory` → 장비 행 재고수량 입력·저장 → 값 반영 확인. (권한 없는 sales는 메뉴 미노출 — 별도 단언 선택).

- [ ] **Step 2: 실행** — Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e -- inventory` / Expected: PASS.

- [ ] **Step 3: 커밋** — `git commit -m "test: 재고현황 e2e"`

---

## Phase D — 통합 게이트

### Task D1: 전체 게이트 GREEN

- [ ] **Step 1: 데모/잔여 데이터 정리 후 클린 게이트**
```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck
pnpm -r lint
pnpm -r build   # (env 더미 주입)
pnpm --filter web test:e2e
grep -rn "as any" apps/web/src apps/worker/src packages/shared/src packages/db-tests/src --include="*.ts" --include="*.tsx" | wc -l   # 0
```
- [ ] **Step 2: 모든 게이트 GREEN 확인 후 보고** — 실패 항목은 해당 Task로 돌아가 수정.

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** #1=Phase A / #2=B7 / #3=B5·B6 / #2+#3 이력연결=B1·B2·B3 / #4=C1~C7. 전 항목 매핑됨.
- **타입 일관성:** `QuoteCustomer`(B5)=B6·B7 동일 사용. `InventoryRow`(C3)=C5 사용. `stockStatus`(C3)=C5. `companyId`(B4 스키마)=B6 폼·B2 RPC `p_company_id` 연결.
- **플레이스홀더:** SQL 본문 중 "최신 정의 기준 재작성" 지시는 회귀방지용 의도(실제 본문은 실행 시 해당 마이그 확인) — TBD 아님.
- **위험:** `applications_enforce_server_fields`·`create_manual_quote`·`get_company_request_history` 재정의는 반드시 최신 마이그 정의를 복사 후 델타만 적용(중간버전 회귀). db-tests가 회귀 포착.
