# M2 P-B 고객·구매 마스터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **apps/web Next.js는 학습데이터와 다름** — UI 작업 전 `apps/web/node_modules/next/dist/docs/` 관련 가이드를 먼저 읽을 것(AGENTS.md).
> ⚠️ **db-tests는 새 마이그 반영 전 `supabase db reset` 필수**(로컬 Supabase 가동 상태). 게이트 전 reset.

**Goal:** 정규화된 고객 마스터(companies + company_equipment) + admin CRUD + anon biz_no 조회 RPC + 견적요청→고객 멱등 upsert를 추가해 P-D(A/S)·P-E(소모품)·P-F(이력)의 전제를 충족한다.

**Architecture:** 단일테넌트·capability RLS(`has_permission`). 신규 capability `customers.manage`로 쓰기 게이트, 읽기는 authenticated 전원. anon 노출은 SECURITY DEFINER RPC 단일 경로(직접 테이블 SELECT 차단). 서버통제값(created_at·source_application_id)은 BEFORE 트리거 불변 강제. 보유장비는 **id 보존 diff-upsert**(replace 금지 — 향후 FK 이력 보존).

**Tech Stack:** Supabase(Postgres·RLS·PL/pgSQL) · Next.js App Router(apps/web) · pnpm 모노레포 · Vitest(단위·db-tests RLS) · Playwright(E2E) · zod · react-hook-form.

**근거:** 스펙 = GitHub #20(본문 + "Autoplan 리뷰 개정 A1-A20" + 감사추적). 테스트플랜 = `~/.gstack/projects/jhtechSaaS/main-pb-test-plan-20260601-232006.md`.

---

## File Structure

**신규 마이그레이션 (`supabase/migrations/`)**
- `20260602100001_companies.sql` — companies 테이블 + RLS 4 + 서버필드 트리거(created_at·source 불변) + 부분 UNIQUE + CHECK
- `20260602100002_company_equipment.sql` — company_equipment + RLS 4 + 트리거 + identity XOR CHECK
- `20260602100003_lookup_company_by_biz_no.sql` — anon SECURITY DEFINER 조회 RPC(노출 화이트리스트, equipment_public 경유)
- `20260602100004_customer_functions.sql` — `upsert_company_from_application` + `search_applications_for_customer`(둘 다 SECURITY DEFINER, customers.manage 내부검증)

**롤백 (`supabase/rollback/`)** — 위 4개 각 `_down.sql`

**shared (`packages/shared/src/`)**
- `permissions.ts` — `customers.manage` 키 추가(6→7)
- `biz-no.ts` — `normalizeBizNo`·`formatBizNo` 추가(`biz-no.test.ts` 확장)

**web 서비스 (`apps/web/src/lib/`)**
- `lib/customers/schema.ts` — `companyFormSchema`(zod, biz_no 선택+체크섬, equipment 배열 XOR)
- `lib/customers/queries.ts` — `listCompanies`·`getCompany`·`listAssignableStaff`·`searchApplicationsForCustomer`
- `lib/customers/actions.ts` — `createCustomer`·`updateCustomer`·`deleteCustomer`·`registerFromApplication`
- `lib/auth/guard.ts` — `requireCustomersManage` 추가(1줄)

**web UI (`apps/web/src/app/admin/customers/`)**
- `page.tsx`·`loading.tsx`·`error.tsx` — 목록(정렬·담당영업 필터·미배정 amber)
- `new/page.tsx` — 2모드 세그먼트(직접/가져오기)
- `[id]/edit/page.tsx`·`[id]/edit/loading.tsx`·`[id]/edit/error.tsx`
- `_components/CompanyForm.tsx` — 고객 폼(assignee 드롭다운 + dedup 배너)
- `_components/CompanyEquipmentEditor.tsx` — 보유장비 인라인(행 토글·diff by id)
- `_components/CompanyTable.tsx` — 목록 테이블
- `_components/ApplicationPicker.tsx` — 가져오기 검색→선택

**db-tests (`packages/db-tests/src/`)** — `companies.test.ts`·`company_equipment.test.ts`·`lookup_company.test.ts`·`upsert_company.test.ts`
**E2E (`apps/web/e2e/` 또는 기존 위치)** — `customers.spec.ts`

---

## Task 1: shared — customers.manage 권한 키

**Files:**
- Modify: `packages/shared/src/permissions.ts:6-13`
- Test: `packages/shared/src/permissions.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `permissions.test.ts`에 추가

```typescript
import { PERMISSIONS, can } from "./permissions";

test("customers.manage 키가 registry에 존재", () => {
  expect(PERMISSIONS).toContain("customers.manage");
});

test("users.manage 보유자는 customers.manage도 통과(슈퍼권한)", () => {
  expect(can(["users.manage"], "customers.manage")).toBe(true);
});

test("customers.manage만 보유 시 customers.manage 통과, equipment.manage 불가", () => {
  expect(can(["customers.manage"], "customers.manage")).toBe(true);
  expect(can(["customers.manage"], "equipment.manage")).toBe(false);
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @jhtechsaas/shared test` → `customers.manage` 미존재로 타입/단언 FAIL

- [ ] **Step 3: 최소 구현** — `permissions.ts` PERMISSIONS 배열에 추가(주석 6→7 갱신)

```typescript
/** v1 권한 키 (7개). 미래 확장: delivery.dispatch, install.manage 등. */
export const PERMISSIONS = [
  "applications.view_all", // 전체 신청 조회 (없으면 자기 배정 건만)
  "applications.assign", // 담당자 배정
  "quotes.write", // 견적 작성·확정·재발행
  "equipment.manage", // 장비·옵션 관리
  "customers.manage", // 고객·보유장비 마스터 관리 (P-B)
  "email.send", // 견적 메일 발송
  "users.manage", // 사용자·권한 관리 (= 관리자, 전체 우회)
] as const;
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter @jhtechsaas/shared test` → PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/permissions.ts packages/shared/src/permissions.test.ts
git commit -m "feat: customers.manage capability 추가 (P-B #20)"
```

---

## Task 2: shared — normalizeBizNo / formatBizNo

**Files:**
- Modify: `packages/shared/src/biz-no.ts`
- Test: `packages/shared/src/biz-no.test.ts`

- [ ] **Step 1: 실패 테스트** — `biz-no.test.ts`에 추가

```typescript
import { normalizeBizNo, formatBizNo, validateBizNo } from "./biz-no";

test("normalizeBizNo: 하이픈·공백 등 비숫자 전부 제거", () => {
  expect(normalizeBizNo("123-45-67890")).toBe("1234567890");
  expect(normalizeBizNo("123 45 67890")).toBe("1234567890");
  expect(normalizeBizNo("  123456 7890 ")).toBe("1234567890");
});

test("formatBizNo: 10자리 → 3-2-5 대시 포맷, 비정상은 원본 반환", () => {
  expect(formatBizNo("1234567890")).toBe("123-45-67890");
  expect(formatBizNo("123-45-67890")).toBe("123-45-67890"); // 이미 포맷/내부 normalize
  expect(formatBizNo("")).toBe("");
  expect(formatBizNo("12345")).toBe("12345"); // 10자리 아님 → 그대로
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @jhtechsaas/shared test` → 함수 미존재 FAIL

- [ ] **Step 3: 최소 구현** — `biz-no.ts`에 추가(기존 `validateBizNo` 아래)

```typescript
/** 사업자번호 정규화 — 비숫자 전부 제거. 클라/서버 RPC와 동일 규칙으로 단일화. */
export function normalizeBizNo(input: string): string {
  return input.replace(/\D/g, "");
}

/** 표시용 포맷 — 10자리면 3-2-5 대시, 아니면 원본 유지. (mono tabular와 함께 렌더) */
export function formatBizNo(input: string): string {
  const d = normalizeBizNo(input);
  if (d.length !== 10) return input;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter @jhtechsaas/shared test` → PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/biz-no.ts packages/shared/src/biz-no.test.ts
git commit -m "feat: biz_no normalize/format 유틸 shared 단일화 (P-B #20, A7)"
```

---

## Task 3: 마이그레이션 — companies 테이블 + RLS + 트리거

**Files:**
- Create: `supabase/migrations/20260602100001_companies.sql`
- Create: `supabase/rollback/20260602100001_companies_down.sql`
- Test: `packages/db-tests/src/companies.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `companies.test.ts`

```typescript
// companies RLS·CHECK·트리거 통합 테스트. E1 하니스 재사용.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cust-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cust-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.sales1]);
}

describe("companies — customers.manage 게이트", () => {
  test("보유자 INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.companies (name,biz_no) values ('가나상사','1234567890') returning id");
      expect(r.rowCount).toBe(1);
    });
  });
  test("미보유 sales INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.sales1);
      await expect(c.query("insert into public.companies (name) values ('금지')")).rejects.toThrow();
    });
  });
  test("anon 직접 SELECT = 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name) values ('비밀상사')");
      await asAnon(c);
      const r = await c.query("select id from public.companies");
      expect(r.rowCount).toBe(0);
    });
  });
  test("authenticated 전원 SELECT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name) values ('공개상사')");
      await asUser(c, UID.sales1); // customers.manage 없어도 읽기 가능
      const r = await c.query("select id from public.companies");
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("companies — 제약·트리거", () => {
  test("biz_no 부분 UNIQUE: 중복 거부, NULL 복수 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.companies (name,biz_no) values ('A','1234567890')");
      await expect(c.query("insert into public.companies (name,biz_no) values ('B','1234567890')")).rejects.toThrow();
      const r = await c.query("insert into public.companies (name) values ('C'),('D') returning id"); // 둘 다 NULL
      expect(r.rowCount).toBe(2);
    });
  });
  test("biz_no 형식 CHECK: 10자리 아니면 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.companies (name,biz_no) values ('X','12345')")).rejects.toThrow();
    });
  });
  test("created_at·source_application_id UPDATE 불변(트리거)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const app = await c.query("insert into public.applications (company) values ('출처') returning id");
      const ins = await c.query(
        "insert into public.companies (name,source_application_id) values ('보존',$1) returning id, created_at, source_application_id",
        [app.rows[0].id],
      );
      const { id, created_at, source_application_id } = ins.rows[0];
      await asUser(c, UID.admin);
      await c.query("update public.companies set created_at='2000-01-01', source_application_id=null, name='바뀜' where id=$1", [id]);
      await asPostgres(c);
      const after = await c.query("select created_at, source_application_id, name from public.companies where id=$1", [id]);
      expect(after.rows[0].created_at.toISOString()).toBe(created_at.toISOString()); // 불변
      expect(after.rows[0].source_application_id).toBe(source_application_id); // 불변
      expect(after.rows[0].name).toBe("바뀜"); // 일반 필드는 변경됨
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- companies` → `relation "public.companies" does not exist` FAIL

- [ ] **Step 3: 마이그레이션 작성** — `20260602100001_companies.sql`

```sql
-- M2 P-B #20 — companies(고객 마스터). 쓰기=customers.manage, 읽기=authenticated 전원.
-- biz_no nullable + 부분 UNIQUE(D2). source_application_id=자동생성 출처(불변·ON DELETE SET NULL).
-- created_at·source_application_id 서버 통제 → BEFORE 트리거 강제(applications 패턴 재사용, A4).

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  biz_no text,
  name text not null,
  ceo text,
  phone text,
  email text,
  address text,
  assignee_id uuid references public.profiles (id),
  source_application_id uuid references public.applications (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_biz_no_format check (biz_no is null or biz_no ~ '^\d{10}$'),
  constraint companies_name_len check (char_length(name) <= 200),
  constraint companies_address_len check (address is null or char_length(address) <= 500)
);
create unique index companies_biz_no_unique on public.companies (biz_no) where biz_no is not null;
create index companies_assignee_idx on public.companies (assignee_id);
create index companies_updated_idx on public.companies (updated_at desc);

create or replace function public.companies_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.created_at := old.created_at;                       -- 불변
    new.source_application_id := old.source_application_id;  -- 출처 불변(감사)
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger companies_server_fields
  before insert or update on public.companies
  for each row execute function public.companies_enforce_server_fields();

alter table public.companies enable row level security;

create policy companies_select on public.companies
  for select to authenticated using (true);
create policy companies_insert on public.companies
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_update on public.companies
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_delete on public.companies
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));
```

- [ ] **Step 4: 롤백 작성** — `supabase/rollback/20260602100001_companies_down.sql`

```sql
drop trigger if exists companies_server_fields on public.companies;
drop function if exists public.companies_enforce_server_fields();
drop table if exists public.companies cascade;
```

- [ ] **Step 5: 통과 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- companies` → PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260602100001_companies.sql supabase/rollback/20260602100001_companies_down.sql packages/db-tests/src/companies.test.ts
git commit -m "feat: companies 테이블 + RLS + 불변 트리거 (P-B #20)"
```

---

## Task 4: 마이그레이션 — company_equipment 테이블

**Files:**
- Create: `supabase/migrations/20260602100002_company_equipment.sql`
- Create: `supabase/rollback/20260602100002_company_equipment_down.sql`
- Test: `packages/db-tests/src/company_equipment.test.ts`

- [ ] **Step 1: 실패 테스트** — `company_equipment.test.ts`

```typescript
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "ce-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "ce-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'장비',1000,'active')", [EQ]);
  const r = await c.query("insert into public.companies (name) values ('보유사') returning id");
  return r.rows[0].id as string;
}

describe("company_equipment — identity XOR CHECK", () => {
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("label만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,label) values ($1,'단종장비') returning id", [cid]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id,equipment_id,label) values ($1,$2,'x')", [cid, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  test("미보유 sales INSERT 거부 / anon 직접 SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed();
      await asUser(c, UID.sales1);
      await expect(c.query("insert into public.company_equipment (company_id,label) values ($1,'금지')", [cid])).rejects.toThrow();
      await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'행')", [cid]);
      await asAnon(c);
      expect((await c.query("select id from public.company_equipment")).rowCount).toBe(0);
    });
  });
  test("company 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'a')", [cid]);
      await c.query("delete from public.companies where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.company_equipment where company_id=$1", [cid])).rowCount).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- company_equipment` → 테이블 없음 FAIL

- [ ] **Step 3: 마이그레이션** — `20260602100002_company_equipment.sql`

```sql
-- M2 P-B #20 — company_equipment(보유장비). equipment_id(카탈로그) XOR label(자유입력)=정확히 하나(A6).
-- company 삭제 시 cascade. id는 향후 P-D/P-E/P-F FK 참조 → admin 저장은 diff-upsert로 id 보존(actions, A1).
create table public.company_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  equipment_id uuid references public.equipment (id),
  label text,
  serial_no text,
  purchased_at date,
  install_address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_equipment_identity
    check ((equipment_id is not null) <> (nullif(btrim(label), '') is not null))
);
create index company_equipment_company_idx on public.company_equipment (company_id);
create index company_equipment_equipment_idx on public.company_equipment (equipment_id);

create or replace function public.company_equipment_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger company_equipment_server_fields
  before insert or update on public.company_equipment
  for each row execute function public.company_equipment_enforce_server_fields();

alter table public.company_equipment enable row level security;
create policy company_equipment_select on public.company_equipment
  for select to authenticated using (true);
create policy company_equipment_insert on public.company_equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_update on public.company_equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_delete on public.company_equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));
```

- [ ] **Step 4: 롤백** — `supabase/rollback/20260602100002_company_equipment_down.sql`

```sql
drop trigger if exists company_equipment_server_fields on public.company_equipment;
drop function if exists public.company_equipment_enforce_server_fields();
drop table if exists public.company_equipment cascade;
```

- [ ] **Step 5: 통과 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- company_equipment` → PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260602100002_company_equipment.sql supabase/rollback/20260602100002_company_equipment_down.sql packages/db-tests/src/company_equipment.test.ts
git commit -m "feat: company_equipment 테이블 + XOR identity + RLS (P-B #20)"
```

---

## Task 5: 마이그레이션 — lookup_company_by_biz_no (anon RPC)

**Files:**
- Create: `supabase/migrations/20260602100003_lookup_company_by_biz_no.sql`
- Create: `supabase/rollback/20260602100003_lookup_company_by_biz_no_down.sql`
- Test: `packages/db-tests/src/lookup_company.test.ts`

- [ ] **Step 1: 실패 테스트** — `lookup_company.test.ts`

```typescript
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ_ACTIVE = "00000000-0000-0000-0000-0000000000e1";
const EQ_INACTIVE = "00000000-0000-0000-0000-0000000000e2";

async function seed(): Promise<void> {
  await asPostgres(c);
  await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'활성기',1000,'active'),($2,'비활성기',2000,'inactive')", [EQ_ACTIVE, EQ_INACTIVE]);
  const co = await c.query("insert into public.companies (name,biz_no,phone) values ('조회상사','1234567890','010') returning id");
  const cid = co.rows[0].id;
  await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2)", [cid, EQ_ACTIVE]);
  await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2)", [cid, EQ_INACTIVE]);
  await c.query("insert into public.company_equipment (company_id,label) values ($1,'단종품')", [cid]);
}

describe("lookup_company_by_biz_no — anon RPC", () => {
  test("유효 biz_no(대시 포함) → 회사+장비 jsonb", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const r = await c.query("select public.lookup_company_by_biz_no('123-45-67890') as j");
      const j = r.rows[0].j;
      expect(j.name).toBe("조회상사");
      expect(j.phone).toBe("010"); // D5 전체노출(연락처 포함)
      expect(j.equipment).toHaveLength(3);
    });
  });
  test("inactive 장비명 미노출(equipment_public 경유) — name=null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const j = (await c.query("select public.lookup_company_by_biz_no('1234567890') as j")).rows[0].j;
      const active = j.equipment.find((e: any) => e.equipment_id === EQ_ACTIVE);
      const inactive = j.equipment.find((e: any) => e.equipment_id === EQ_INACTIVE);
      expect(active.equipment_name).toBe("활성기");
      expect(inactive.equipment_name).toBeNull(); // inactive는 equipment_public에 없음 → null
    });
  });
  test("미등록 biz_no → null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      expect((await c.query("select public.lookup_company_by_biz_no('9999999999') as j")).rows[0].j).toBeNull();
    });
  });
  test("형식 오류 → null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      expect((await c.query("select public.lookup_company_by_biz_no('abc') as j")).rows[0].j).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- lookup_company` → 함수 없음 FAIL

- [ ] **Step 3: 마이그레이션** — `20260602100003_lookup_company_by_biz_no.sql`

```sql
-- M2 P-B #20 — anon 사업자번호 조회 RPC. D5: 전체노출(연락처 포함). 노출필드 화이트리스트(A5).
-- 장비명은 equipment_public(active만) 경유 → inactive 카탈로그명 누출 차단.
create or replace function public.lookup_company_by_biz_no(p_biz_no text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_company public.companies%rowtype;
  v_equipment jsonb;
begin
  if v_biz !~ '^\d{10}$' then return null; end if;
  select * into v_company from public.companies where biz_no = v_biz limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ce.id,
    'equipment_id', ce.equipment_id,
    'equipment_name', ep.name,        -- equipment_public(active만); inactive면 null
    'label', ce.label,
    'purchased_at', ce.purchased_at,
    'install_address', ce.install_address
  ) order by ce.created_at), '[]'::jsonb)
  into v_equipment
  from public.company_equipment ce
  left join public.equipment_public ep on ep.id = ce.equipment_id
  where ce.company_id = v_company.id;
  return jsonb_build_object(
    'company_id', v_company.id,
    'name', v_company.name,
    'ceo', v_company.ceo,
    'phone', v_company.phone,
    'email', v_company.email,
    'address', v_company.address,
    'equipment', v_equipment
  );
end;
$$;
revoke all on function public.lookup_company_by_biz_no(text) from public;
grant execute on function public.lookup_company_by_biz_no(text) to anon, authenticated;
```

- [ ] **Step 4: 롤백** — `supabase/rollback/20260602100003_lookup_company_by_biz_no_down.sql`

```sql
drop function if exists public.lookup_company_by_biz_no(text);
```

- [ ] **Step 5: 통과 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- lookup_company` → PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260602100003_lookup_company_by_biz_no.sql supabase/rollback/20260602100003_lookup_company_by_biz_no_down.sql packages/db-tests/src/lookup_company.test.ts
git commit -m "feat: lookup_company_by_biz_no anon RPC + 노출 화이트리스트 (P-B #20)"
```

---

## Task 6: 마이그레이션 — upsert + search 함수

**Files:**
- Create: `supabase/migrations/20260602100004_customer_functions.sql`
- Create: `supabase/rollback/20260602100004_customer_functions_down.sql`
- Test: `packages/db-tests/src/upsert_company.test.ts`

- [ ] **Step 1: 실패 테스트** — `upsert_company.test.ts`

```typescript
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "up-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "up-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
}
async function mkApp(biz: string | null, company = "신청사"): Promise<string> {
  const r = await c.query("insert into public.applications (company,biz_no,phone) values ($1,$2,'010-1') returning id", [company, biz]);
  return r.rows[0].id as string;
}

describe("upsert_company_from_application", () => {
  test("권한 없으면 raise", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp("1234567890"); await asUser(c, UID.sales1);
      await expect(c.query("select public.upsert_company_from_application($1)", [app])).rejects.toThrow(/customers.manage/);
    });
  });
  test("신규 → created=true, 고객 생성 + source 연결", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp("1234567890"); await asUser(c, UID.admin);
      const j = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j.created).toBe(true);
      await asPostgres(c);
      const co = await c.query("select source_application_id from public.companies where id=$1", [j.company_id]);
      expect(co.rows[0].source_application_id).toBe(app);
    });
  });
  test("biz_no 일치 기존 고객 → created=false, 신규 안 만듦(멱등)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name,biz_no) values ('기존','1234567890')");
      const app = await mkApp("123-45-67890"); // 정규화 후 동일
      await asUser(c, UID.admin);
      const j = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j.created).toBe(false);
      await asPostgres(c);
      expect((await c.query("select count(*) n from public.companies where biz_no='1234567890'")).rows[0].n).toBe("1");
    });
  });
  test("biz_no NULL → 동일 신청 재호출 시 신규 안 만듦(source dedupe)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp(null); await asUser(c, UID.admin);
      const j1 = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      const j2 = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j1.company_id).toBe(j2.company_id);
      expect(j2.created).toBe(false);
    });
  });
});

describe("search_applications_for_customer", () => {
  test("권한 없으면 raise", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await mkApp("1234567890", "검색대상"); await asUser(c, UID.sales1);
      await expect(c.query("select * from public.search_applications_for_customer('검색')")).rejects.toThrow(/customers.manage/);
    });
  });
  test("회사명/biz_no/seq_no 검색(권한자, view_all 불필요)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await mkApp("1234567890", "유니크검색사"); await asUser(c, UID.admin); // admin엔 view_all 없음
      const r = await c.query("select * from public.search_applications_for_customer('유니크검색')");
      expect(r.rowCount).toBe(1);
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- upsert_company` → 함수 없음 FAIL

- [ ] **Step 3: 마이그레이션** — `20260602100004_customer_functions.sql`

```sql
-- M2 P-B #20 — 견적요청→고객 멱등 upsert(A2·A3) + 가져오기 검색(A8). 둘 다 DEFINER, customers.manage 내부검증.

-- upsert: biz_no 있으면 biz_no로, 없으면 source_application_id로 dedupe. ON CONFLICT 금지(부분 UNIQUE arbiter 미작동)
-- → EXCEPTION 블록으로 race 처리(A2). 반환 {company_id, created}(A9 dedup 배너용).
create or replace function public.upsert_company_from_application(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications%rowtype;
  v_biz text;
  v_company_id uuid;
  v_created boolean := false;
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  select * into v_app from public.applications where id = p_application_id;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  v_biz := nullif(regexp_replace(coalesce(v_app.biz_no, ''), '\D', '', 'g'), '');

  if v_biz is not null then
    select id into v_company_id from public.companies where biz_no = v_biz;
  else
    select id into v_company_id from public.companies where source_application_id = p_application_id;
  end if;

  if v_company_id is null then
    begin
      insert into public.companies (biz_no, name, ceo, phone, email, address, assignee_id, source_application_id)
      values (
        v_biz, v_app.company,
        nullif(btrim(v_app.ceo), ''), nullif(btrim(v_app.phone), ''),
        nullif(btrim(v_app.email), ''), nullif(btrim(v_app.address), ''),
        v_app.assignee_id, p_application_id
      )
      returning id into v_company_id;
      v_created := true;
    exception when unique_violation then
      -- race: 다른 트랜잭션이 같은 biz_no 선점 → 재조회
      select id into v_company_id from public.companies where biz_no = v_biz;
    end;
  else
    -- 기존 고객: 빈 필드만 보강(덮어쓰지 않음). source는 트리거로 불변.
    update public.companies set
      ceo = coalesce(ceo, nullif(btrim(v_app.ceo), '')),
      phone = coalesce(phone, nullif(btrim(v_app.phone), '')),
      email = coalesce(email, nullif(btrim(v_app.email), '')),
      address = coalesce(address, nullif(btrim(v_app.address), ''))
    where id = v_company_id;
  end if;

  return jsonb_build_object('company_id', v_company_id, 'created', v_created);
end;
$$;
revoke all on function public.upsert_company_from_application(uuid) from public;
grant execute on function public.upsert_company_from_application(uuid) to authenticated;

-- 가져오기 검색: customers.manage 보유자는 applications.view_all 없이도 전체 신청 검색(A8).
-- biz_no 검색은 정규화 질의에 숫자가 있을 때만(빈 패턴 전체매칭 방지).
create or replace function public.search_applications_for_customer(p_query text)
returns table (id uuid, seq_no text, company text, biz_no text, ceo text, phone text, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then return; end if;
  return query
    select a.id, a.seq_no, a.company, a.biz_no, a.ceo, a.phone, a.email, a.created_at
    from public.applications a
    where a.company ilike '%' || v_q || '%'
       or a.seq_no ilike '%' || v_q || '%'
       or (char_length(v_digits) >= 3 and a.biz_no ilike '%' || v_digits || '%')
    order by a.created_at desc
    limit 20;
end;
$$;
revoke all on function public.search_applications_for_customer(text) from public;
grant execute on function public.search_applications_for_customer(text) to authenticated;
```

- [ ] **Step 4: 롤백** — `supabase/rollback/20260602100004_customer_functions_down.sql`

```sql
drop function if exists public.search_applications_for_customer(text);
drop function if exists public.upsert_company_from_application(uuid);
```

- [ ] **Step 5: 통과 확인** — `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- upsert_company` → PASS. 전체 회귀: `pnpm --filter @jhtechsaas/db-tests test:rls`

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260602100004_customer_functions.sql supabase/rollback/20260602100004_customer_functions_down.sql packages/db-tests/src/upsert_company.test.ts
git commit -m "feat: upsert_company_from_application(멱등) + search RPC (P-B #20, A2/A3/A8)"
```

---

## Task 7: web — companyFormSchema (zod)

**Files:**
- Create: `apps/web/src/lib/customers/schema.ts`
- Test: `apps/web/src/lib/customers/schema.test.ts`

- [ ] **Step 1: 실패 테스트** — `schema.test.ts`

```typescript
import { describe, expect, test } from "vitest";
import { companyFormSchema } from "./schema";

const base = { name: "가나", biz_no: "1234567890", ceo: "", phone: "", email: "", address: "", note: "", assignee_id: "", equipment: [] };

describe("companyFormSchema", () => {
  test("name만 있으면 통과(biz_no 선택)", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "" }).success).toBe(true);
  });
  test("biz_no 체크섬 불일치 거부", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "1234567891" }).success).toBe(false);
  });
  test("equipment 행: equipment_id와 label 둘 다 있으면 거부(XOR)", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "00000000-0000-0000-0000-0000000000e1", label: "x", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(false);
  });
  test("equipment 행: 둘 다 없으면 거부", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "", label: "", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(false);
  });
  test("equipment 행: label만 → 통과", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "", label: "단종품", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test -- schema` → 모듈 없음 FAIL

- [ ] **Step 3: 구현** — `apps/web/src/lib/customers/schema.ts`

```typescript
import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

// 고객 폼 — 클라(react-hook-form) + 서버액션 재검증 공유. biz_no는 선택(D2), 있으면 체크섬.
const bizNoOptional = z
  .string().trim()
  .refine((v) => v === "" || validateBizNo(v), "사업자등록번호 체크섬이 일치하지 않습니다");

// 보유장비 행 — equipment_id(카탈로그) XOR label(자유). id는 기존행 식별(diff-upsert, 신규는 "").
export const companyEquipmentRowSchema = z
  .object({
    id: z.string(), // 기존 uuid 또는 "" (신규)
    equipment_id: z.string(), // uuid 또는 ""
    label: z.string().trim(),
    serial_no: z.string().trim(),
    purchased_at: z.string(), // "" 또는 YYYY-MM-DD
    install_address: z.string().trim(),
  })
  .refine(
    (r) => (r.equipment_id !== "") !== (r.label !== ""),
    "카탈로그 장비 또는 직접입력 장비명 중 하나만 지정하세요",
  );

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "업체명을 입력하세요").max(200, "200자 이내"),
  biz_no: bizNoOptional,
  ceo: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(500, "500자 이내").default(""),
  note: z.string().trim().max(2000).default(""),
  assignee_id: z.string().default(""), // uuid 또는 "" (미배정)
  equipment: z.array(companyEquipmentRowSchema).default([]),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type CompanyEquipmentRow = z.infer<typeof companyEquipmentRowSchema>;
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter web test -- schema` → PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/customers/schema.ts apps/web/src/lib/customers/schema.test.ts
git commit -m "feat: companyFormSchema zod (biz_no 선택·장비 XOR) (P-B #20)"
```

---

## Task 8: web — guard + queries

**Files:**
- Modify: `apps/web/src/lib/auth/guard.ts:48` (1줄 추가)
- Create: `apps/web/src/lib/customers/queries.ts`

> queries는 RLS 의존 서버조회라 단위테스트보다 E2E(Task 13)·db-tests로 검증. 여기선 타입·컴파일 통과가 게이트.

- [ ] **Step 1: guard 추가** — `guard.ts` 끝에

```typescript
export const requireCustomersManage = () => requirePermission("customers.manage");
```

- [ ] **Step 2: queries 작성** — `apps/web/src/lib/customers/queries.ts`

```typescript
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CompanyListRow {
  id: string;
  name: string;
  biz_no: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  equipment_count: number;
  updated_at: string;
}

// 목록: 보유장비수 집계는 단일 쿼리(N+1 금지, A10). RLS=authenticated 전원 SELECT.
export async function listCompanies(): Promise<CompanyListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,biz_no,assignee_id,updated_at,profiles:assignee_id(display_name),company_equipment(count)")
    .order("updated_at", { ascending: false });
  if (error) { console.error("[customers.list]", error); return []; }
  // profiles 조인 컬럼명은 실제 profiles 스키마에 맞게(display_name 또는 name) — 구현 시 확인.
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, biz_no: r.biz_no, assignee_id: r.assignee_id,
    assignee_name: r.profiles?.display_name ?? null,
    equipment_count: r.company_equipment?.[0]?.count ?? 0,
    updated_at: r.updated_at,
  }));
}

export async function getCompany(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("*, company_equipment(*)")
    .eq("id", id)
    .single();
  return data;
}

// assignee 드롭다운 소스 = active 직원 + "미배정"(UI에서 NULL). profiles 스키마의 active 컬럼 확인 필요.
export async function listAssignableStaff() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("is_active", true)
    .order("display_name");
  return data ?? [];
}

// 가져오기 검색 — DEFINER RPC(customers.manage 게이트).
export async function searchApplicationsForCustomer(query: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_applications_for_customer", { p_query: query });
  if (error) { console.error("[customers.searchApps]", error); return []; }
  return data ?? [];
}
```

> ⚠️ 구현자 확인: `profiles` 테이블의 표시이름 컬럼(`display_name` vs `name`)·`is_active` 컬럼 존재를 `supabase/migrations/20260529150001_auth_profiles.sql`에서 확인 후 정확히 맞출 것. Supabase 임베드 조인(`profiles:assignee_id(...)`·`company_equipment(count)`) 문법은 PostgREST 버전 확인.

- [ ] **Step 3: 타입 통과** — `pnpm --filter web typecheck` → PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/auth/guard.ts apps/web/src/lib/customers/queries.ts
git commit -m "feat: customers 가드 + 조회 queries (P-B #20)"
```

---

## Task 9: web — actions (diff-upsert 핵심)

**Files:**
- Create: `apps/web/src/lib/customers/actions.ts`
- Test: `apps/web/src/lib/customers/equipment-diff.test.ts` (순수 diff 함수 단위)

> **A1 핵심**: 보유장비는 **id 보존 diff-upsert**. 순수 diff 계산을 분리해 단위테스트.

- [ ] **Step 1: 실패 테스트** — diff 순수함수 `equipment-diff.test.ts`

```typescript
import { describe, expect, test } from "vitest";
import { diffEquipment } from "./actions";
import type { CompanyEquipmentRow } from "./schema";

const row = (o: Partial<CompanyEquipmentRow>): CompanyEquipmentRow => ({
  id: "", equipment_id: "", label: "", serial_no: "", purchased_at: "", install_address: "", ...o,
});

describe("diffEquipment — id 보존 diff(replace 금지)", () => {
  test("신규(id 없음)=insert, 사라진 기존 id=delete, 남은 id=update", () => {
    const existing = ["A", "B", "C"]; // 기존 행 id
    const submitted = [row({ id: "A", label: "a2" }), row({ id: "C", label: "c" }), row({ label: "신규" })];
    const d = diffEquipment("CID", existing, submitted);
    expect(d.toDelete.sort()).toEqual(["B"]);
    expect(d.toUpdate.map((u) => u.id)).toEqual(["A", "C"]);
    expect(d.toInsert).toHaveLength(1);
    expect(d.toInsert[0].company_id).toBe("CID");
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test -- equipment-diff` → `diffEquipment` 미존재 FAIL

- [ ] **Step 3: 구현** — `apps/web/src/lib/customers/actions.ts`

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeBizNo } from "@jhtechsaas/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomersManage } from "@/lib/auth/guard";
import { companyFormSchema, type CompanyFormValues, type CompanyEquipmentRow } from "@/lib/customers/schema";

export type CustomerActionResult = { error: string } | null;

// equipment_id/label·날짜 빈문자 → DB 값으로 정규화한 행.
function toDbRow(company_id: string, r: CompanyEquipmentRow) {
  return {
    company_id,
    equipment_id: r.equipment_id || null,
    label: r.equipment_id ? null : (r.label || null),
    serial_no: r.serial_no || null,
    purchased_at: r.purchased_at || null,
    install_address: r.install_address || null,
  };
}

// A1: id 보존 diff. existing=기존 row id 배열, submitted=폼 행. 순수함수(테스트 가능).
export function diffEquipment(company_id: string, existing: string[], submitted: CompanyEquipmentRow[]) {
  const submittedIds = new Set(submitted.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((id) => !submittedIds.has(id));
  const toUpdate = submitted.filter((r) => r.id).map((r) => ({ id: r.id, ...toDbRow(company_id, r) }));
  const toInsert = submitted.filter((r) => !r.id).map((r) => toDbRow(company_id, r));
  return { toDelete, toUpdate, toInsert };
}

async function applyEquipmentDiff(supabase: SupabaseClient, companyId: string, values: CompanyFormValues): Promise<string | null> {
  const { data: existingRows, error: exErr } = await supabase.from("company_equipment").select("id").eq("company_id", companyId);
  if (exErr) return exErr.message;
  const { toDelete, toUpdate, toInsert } = diffEquipment(companyId, (existingRows ?? []).map((r: any) => r.id), values.equipment);
  if (toDelete.length) {
    const { error } = await supabase.from("company_equipment").delete().in("id", toDelete);
    if (error) return error.message;
  }
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    const { error } = await supabase.from("company_equipment").update(rest).eq("id", id);
    if (error) return error.message;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("company_equipment").insert(toInsert);
    if (error) return error.message;
  }
  return null;
}

function companyRow(v: CompanyFormValues) {
  return {
    name: v.name,
    biz_no: v.biz_no ? normalizeBizNo(v.biz_no) : null,
    ceo: v.ceo || null, phone: v.phone || null, email: v.email || null,
    address: v.address || null, note: v.note || null,
    assignee_id: v.assignee_id || null,
  };
}

export async function createCustomer(id: string, values: CompanyFormValues): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("companies").insert({ id, ...companyRow(v) });
  if (error) {
    // A13: biz_no 부분 UNIQUE 충돌(23505) → 친절한 필드 에러.
    if ((error as any).code === "23505") return { error: "이미 등록된 사업자번호입니다." };
    console.error("[customers.create]", error);
    return { error: "저장하지 못했습니다." };
  }
  const eqErr = await applyEquipmentDiff(supabase, id, v);
  if (eqErr) {
    console.error("[customers.create] 장비 저장 실패, 보상 삭제", eqErr);
    await supabase.from("companies").delete().eq("id", id);
    return { error: "보유장비를 저장하지 못했습니다." };
  }
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${id}/edit`);
}

export async function updateCustomer(id: string, values: CompanyFormValues): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = companyFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").update(companyRow(v)).eq("id", id).select("id");
  if (error) {
    if ((error as any).code === "23505") return { error: "이미 등록된 사업자번호입니다." };
    console.error("[customers.update]", error);
    return { error: "저장하지 못했습니다." };
  }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  const eqErr = await applyEquipmentDiff(supabase, id, v);
  if (eqErr) { console.error("[customers.update] 장비 저장 실패", eqErr); return { error: "보유장비를 저장하지 못했습니다." }; }
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

export async function deleteCustomer(id: string): Promise<CustomerActionResult> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").delete().eq("id", id).select("id"); // company_equipment FK cascade
  if (error) { console.error("[customers.delete]", error); return { error: "삭제하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
}

// A9: 견적요청에서 가져오기 → {company_id, created} 반환(UI 배너용). created=false면 기존 고객.
export async function registerFromApplication(applicationId: string): Promise<{ error: string } | { company_id: string; created: boolean }> {
  const access = await requireCustomersManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_company_from_application", { p_application_id: applicationId });
  if (error) { console.error("[customers.registerFromApp]", error); return { error: "고객 등록에 실패했습니다." }; }
  return { company_id: data.company_id as string, created: data.created as boolean };
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter web test -- equipment-diff` PASS · `pnpm --filter web typecheck` PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/customers/actions.ts apps/web/src/lib/customers/equipment-diff.test.ts
git commit -m "feat: customers actions — diff-upsert 장비·dedup·unique 에러 (P-B #20, A1/A9/A13)"
```

---

## Task 10: web UI — 목록 페이지 + 상태 + 필터

**Files:**
- Create: `apps/web/src/app/admin/customers/page.tsx`·`loading.tsx`·`error.tsx`
- Create: `apps/web/src/app/admin/customers/_components/CompanyTable.tsx`

> 미러: `apps/web/src/app/admin/equipment/{page.tsx,loading.tsx,error.tsx}` + `_components/EquipmentTable.tsx`. 가드는 `admin/layout.tsx`가 equipment.manage를 강제하므로 **customers 라우트용 가드 확인** — layout이 equipment.manage 전용이면 customers는 `requireCustomersManage()`를 page에서 호출하거나 layout 가드 정책 확인(아래 주의).

- [ ] **Step 1: page.tsx** — 서버 컴포넌트, `listCompanies()` 호출. 가드: `const access = await requireCustomersManage(); if (access.status==="forbidden") return <Forbidden/>;` (equipment page의 forbidden 패턴 미러). `<CompanyTable rows={rows} myId={access.userId} />`.

- [ ] **Step 2: loading.tsx / error.tsx** — equipment의 것 복사·문구만 교체("고객 목록을 불러오는 중"·"고객 목록을 불러오지 못했습니다").

- [ ] **Step 3: CompanyTable.tsx** (client) — EquipmentTable 미러 + 차이:
  - 컬럼: 업체명 · biz_no(`formatBizNo` + `font-mono tabular-nums`, NULL은 muted `-`) · 담당영업(미배정은 amber soft 배지 — A15) · 보유장비수(mono, 0은 muted) · 등록일(updated, mono).
  - 툴바 담당영업 세그먼트 필터(A10): `전체 · 내 담당(myId) · 미배정(assignee_id===null)`. equipment status 세그먼트 스타일 재사용(`bg-accent text-white` 활성).
  - 검색(업체명·biz_no) 클라 필터.
  - empty 상태: "등록된 고객이 없습니다 / 직접 입력하거나 기존 견적요청에서 가져오세요" + 버튼 2개(`/admin/customers/new?mode=direct`·`?mode=import`).
  - 행 클릭 → `/admin/customers/[id]/edit`.

- [ ] **Step 4: 빌드/타입** — `pnpm --filter web typecheck && pnpm --filter web build` → PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/customers/page.tsx apps/web/src/app/admin/customers/loading.tsx apps/web/src/app/admin/customers/error.tsx apps/web/src/app/admin/customers/_components/CompanyTable.tsx
git commit -m "feat: 고객 목록 admin(정렬·담당영업 필터·미배정 amber) (P-B #20, A10/A15)"
```

---

## Task 11: web UI — 신규(2모드) + 가져오기

**Files:**
- Create: `apps/web/src/app/admin/customers/new/page.tsx`
- Create: `apps/web/src/app/admin/customers/_components/ApplicationPicker.tsx`

- [ ] **Step 1: new/page.tsx** (client 진입 또는 client 래퍼) — A11:
  - 상단 세그먼트 컨트롤 2개(`직접 입력 | 견적요청에서 가져오기`), URL `?mode=direct|import` 동기화(`useSearchParams`/`useRouter`), 기본 `direct`.
  - `mode==="direct"` → `<CompanyForm id={crypto.randomUUID()} mode="create" onSubmit={createCustomer} staff={...} catalog={...} />` (Task 12).
  - `mode==="import"` → `<ApplicationPicker />`.
  - staff·catalog는 서버에서 prefetch해 내려야 하므로 page를 server+client 분리(서버에서 `listAssignableStaff()`·active equipment fetch → client 래퍼 props).

- [ ] **Step 2: ApplicationPicker.tsx** (client) — A9·A11:
  - 검색 입력 → `searchApplicationsForCustomer(q)` 호출(2자 미만 무시).
  - 상태 3종: ①검색 전 안내("업체명·사업자번호·접수번호로 견적요청 검색") ②0건("일치하는 견적요청이 없습니다 — 직접 입력으로 등록" + `?mode=direct` 링크) ③결과 행 목록(업체명·biz_no·접수번호·연락처).
  - 행 선택 → `registerFromApplication(id)` → 결과가 `{company_id, created}`면 `router.push('/admin/customers/'+company_id+'/edit?registered='+(created?'new':'existing'))`. 에러면 toast.

- [ ] **Step 3: 빌드/타입** — `pnpm --filter web typecheck && pnpm --filter web build` → PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/admin/customers/new/page.tsx apps/web/src/app/admin/customers/_components/ApplicationPicker.tsx
git commit -m "feat: 고객 신규 2모드(직접/가져오기) + 신청 picker (P-B #20, A9/A11)"
```

---

## Task 12: web UI — 편집 + CompanyForm + 장비편집기

**Files:**
- Create: `apps/web/src/app/admin/customers/[id]/edit/page.tsx`·`loading.tsx`·`error.tsx`
- Create: `apps/web/src/app/admin/customers/_components/CompanyForm.tsx`
- Create: `apps/web/src/app/admin/customers/_components/CompanyEquipmentEditor.tsx`

> 미러: `EquipmentForm.tsx`(react-hook-form·zodResolver·dirty beforeunload·pending) + `OptionEditor.tsx`(인라인 행). dirty-guard·pending 채택, upload-cleanup 해당없음.

- [ ] **Step 1: edit/page.tsx** (server) — 가드 → `getCompany(id)`(없으면 notFound) + `listAssignableStaff()` + active equipment 목록(`lib/equipment/queries` 재사용, 중복쿼리 금지) → `<CompanyForm mode="edit" ... />`. `searchParams.registered`로 A9 배너 prop 전달(`new`/`existing`).

- [ ] **Step 2: loading.tsx/error.tsx** — equipment edit 것 미러.

- [ ] **Step 3: CompanyForm.tsx** (client) — A9·A16:
  - `useForm({ resolver: zodResolver(companyFormSchema), defaultValues })`. create는 빈 폼, edit는 company 값.
  - 필드: name·biz_no(blur 시 `formatBizNo` 표시, 저장은 raw)·ceo·phone·email·address·note. assignee_id `<select>`(staff props + "미배정"=`""`).
  - dirty beforeunload 경고 + submit pending spinner(EquipmentForm 미러).
  - `registered` prop 배너(A9): `new`→"새 고객으로 등록했습니다" / `existing`→"이미 등록된 고객입니다(사업자번호 일치). 기존 정보를 불러왔습니다 — 변경은 직접 수정하세요".
  - 서버액션 결과 `{error}` 표시. 삭제 버튼(edit만) → confirm "보유장비 N대가 함께 삭제됩니다"(A14) → `deleteCustomer(id)`.
  - `<CompanyEquipmentEditor control={...} catalog={catalog} />`.

- [ ] **Step 4: CompanyEquipmentEditor.tsx** (client) — A12, `useFieldArray`:
  - 행마다 토글 세그먼트 `카탈로그 | 직접입력`. 카탈로그 선택 → equipment active `<select>`(catalog props), label 입력 비활성(disabled)+값 클리어. 직접입력 → label 텍스트, equipment_id 클리어. (토글이 권위 컬럼 결정 → XOR 보장.)
  - 하단 행: serial_no(mono) · purchased_at(`<input type=date>`, mono) · install_address(flex-1).
  - 기존 행은 hidden `id` 유지(diff-upsert 키). "장비 추가" 버튼 → `append({ id:"", equipment_id:"", label:"", ... })`. 행 삭제 버튼. 0행이면 "보유장비가 없습니다" muted.

- [ ] **Step 5: 빌드/타입** — `pnpm --filter web typecheck && pnpm --filter web build` → PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/app/admin/customers/\[id\]/edit/ apps/web/src/app/admin/customers/_components/CompanyForm.tsx apps/web/src/app/admin/customers/_components/CompanyEquipmentEditor.tsx
git commit -m "feat: 고객 편집 폼 + 장비편집기(토글·diff by id) + dedup 배너 (P-B #20, A9/A12/A14/A16)"
```

---

## Task 13: E2E (Playwright)

**Files:**
- Create: `apps/web/e2e/customers.spec.ts` (기존 E2E 디렉토리·로그인 헬퍼 위치 확인 후 정합)

> 기존 E2E(8건)의 admin 로그인 헬퍼·픽스처 패턴을 그대로 재사용. 로컬 Supabase + seed admin(customers.manage는 users.manage로 자동 통과).

- [ ] **Step 1: 시나리오 3종 작성**
  1. admin 로그인 → `/admin/customers` → "직접 입력" 고객 생성(업체명+biz_no) → 편집 진입 → 장비 추가(카탈로그 1 + 직접입력 1) 저장 → 목록 복귀 확인 → 삭제(confirm 보유장비 경고) → 목록에서 사라짐.
  2. "견적요청에서 가져오기": 기존 application(seed) 검색→선택→신규 고객 생성(`registered=new` 배너) ; 같은 biz_no 두 번째 import → 기존 고객으로 라우팅(`registered=existing` 배너, 신규 행 없음).
  3. customers.manage 없는 sales 계정 로그인 → `/admin/customers` 접근 → 403/forbidden 패널(서버 가드 회귀 — P-A1 E2E 누락 교훈).

- [ ] **Step 2: 실행** — `pnpm --filter web test:e2e -- customers` → PASS (로컬 supabase 가동·db reset 후)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/e2e/customers.spec.ts
git commit -m "test: 고객 마스터 E2E 3종(CRUD·가져오기·403) (P-B #20, A17)"
```

---

## Task 14: 전체 게이트 + 마무리

- [ ] **Step 1: db reset + 전체 게이트**

```bash
supabase db reset
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
grep -rn "as any" apps/web/src/lib/customers apps/web/src/app/admin/customers packages/shared/src || echo "as any 0"
```

모두 GREEN이어야 함. `as any` 0(불가피 시 주석 사유).

- [ ] **Step 2: 로드맵 sync** — `docs/roadmap.json`의 P-B status를 `done`(머지 후) — **이 단계는 /ship·/eod에서**. 여기선 변경 안 함.

- [ ] **Step 3: 최종 커밋(필요 시)** — 게이트 수정분.

---

## Self-Review 체크

- **스펙 커버리지**: companies(T3)·company_equipment(T4)·lookup RPC(T5)·upsert+search(T6)·customers.manage(T1)·normalizeBizNo(T2)·schema(T7)·queries+guard(T8)·actions diff-upsert(T9)·목록(T10)·신규2모드(T11)·편집+장비(T12)·E2E(T13)·게이트(T14). AC1-10 + A1-A20 매핑 완료.
- **타입 일관**: `CompanyFormValues`·`CompanyEquipmentRow`(schema) → actions·UI 동일 사용. `diffEquipment` 시그니처 T9 정의=사용 일치. RPC 반환 `{company_id, created}`(T6)=registerFromApplication(T9)=배너(T12) 일치.
- **알려진 확인필요(구현자)**: profiles 표시이름·is_active 컬럼명(T8) · 기존 E2E 로그인 헬퍼 위치(T13) · admin/layout 가드가 equipment.manage 전용인지(customers 라우트 가드 — T10).
- **플레이스홀더**: DB·shared·actions 층은 실제 코드. UI 층(T10-12)은 미러 파일 명시 + 신규 패턴(세그먼트·diff·토글·배너) 코드/지시 명시.
