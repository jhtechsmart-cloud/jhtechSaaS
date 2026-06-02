# M2 P-C 소모품 카탈로그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장비별 소모품 카탈로그(분류 XOR 장비 하이브리드 scope)와 admin CRUD를, P-B 패턴(capability RLS·트리거 불변·id 보존 diff-upsert·db-tests)을 재사용해 구현한다.

**Architecture:** `consumables`(마스터) + `consumable_scope`(분류 또는 장비를 가리키는 junction, CHECK로 XOR) 두 테이블 + `consumables_for_equipment()` 해석 함수. 쓰기는 신규 capability `consumables.manage`로 RLS 게이트, admin은 `users.manage`로 자동 통과. admin UI는 P-B `/admin/customers`를 그대로 미러링(목록·폼·scope 에디터·diff-upsert). 고객용 신청(P-E)은 범위 밖.

**Tech Stack:** Supabase Postgres(마이그레이션·RLS·plpgsql) · Next.js 16 App Router(Server Components·Server Actions) · react-hook-form + zod · Vitest(순수) · `@jhtechsaas/db-tests`(pg `set role` RLS) · Playwright(E2E).

**선행 컨텍스트(반드시 먼저 읽기):**
- 설계 스펙: `docs/superpowers/specs/2026-06-02-m2-pc-consumables-design.md`
- 미러링 원본(P-B): `supabase/migrations/20260602100002_company_equipment.sql`, `apps/web/src/lib/customers/{schema,equipment-diff,queries,actions}.ts`, `apps/web/src/app/admin/customers/**`, `packages/db-tests/src/company_equipment.test.ts`, `packages/shared/src/permissions.{ts,test.ts}`
- 프로젝트 컨벤션: 코드 주석 한국어 · 커밋 prefix(`feat:`/`test:`/`docs:`) · `as any` 금지 · 컴포넌트에 비즈니스 로직 직접 작성 금지(`lib/consumables/`에) · 자식행 저장은 id 보존 diff-upsert(replace 금지).

**게이트(머지 전 전부 통과):** `pnpm --filter @jhtechsaas/shared test` · `web test` · `@jhtechsaas/db-tests test:rls`(직전 `supabase db reset`) · `web typecheck` · `lint` · `build` · `web test:e2e` · `as any` 0.

---

## File Structure

**신규 — 마이그레이션 (`supabase/migrations/`)**
- `20260602100005_consumables.sql` — consumables 테이블 + 트리거 + RLS 4정책
- `20260602100006_consumable_scope.sql` — junction + CHECK + 부분 UNIQUE + 트리거 + RLS
- `20260602100007_consumables_for_equipment.sql` — 해석 함수(SECURITY DEFINER)

**신규 — 롤백 (`supabase/rollback/`, 단수 디렉토리)**
- `20260602100005_consumables_down.sql`
- `20260602100006_consumable_scope_down.sql`
- `20260602100007_consumables_for_equipment_down.sql`

**변경 — 권한 registry (`packages/shared/src/`)**
- `permissions.ts` — `"consumables.manage"` 키 추가(8개)
- `permissions.test.ts` — registry 개수 7→8, consumables.manage describe 블록 추가

**신규 — RLS 테스트 (`packages/db-tests/src/`)**
- `consumables.test.ts` — consumables RLS(권한별 INS/UPD/DEL, SELECT)
- `consumable_scope.test.ts` — XOR CHECK·부분 UNIQUE·RLS·cascade
- `consumables_for_equipment.test.ts` — 분류공통+장비전용 dedup·active 필터

**신규 — web lib (`apps/web/src/lib/consumables/`)**
- `schema.ts` — zod 폼 스키마(소모품 + scope 행)
- `schema.test.ts` — 스키마 단위 테스트
- `scope-diff.ts` — id 보존 diff 순수 로직
- `scope-diff.test.ts` — diff 단위 테스트
- `queries.ts` — listConsumables / getConsumable
- `actions.ts` — create/update/delete + applyScopeDiff(server)

**변경 — guard (`apps/web/src/lib/auth/guard.ts`)**
- `requireConsumablesManage` export 추가

**신규 — admin UI (`apps/web/src/app/admin/consumables/`)**
- `page.tsx` · `loading.tsx` · `error.tsx`
- `_components/ConsumableTable.tsx` · `ConsumableForm.tsx` · `ConsumableScopeEditor.tsx`
- `new/page.tsx` · `new/NewConsumableClient.tsx`
- `[id]/edit/page.tsx` · `[id]/edit/loading.tsx` · `[id]/edit/error.tsx`

**변경 — admin nav (`apps/web/src/app/admin/layout.tsx`)**
- 사이드바에 "소모품" 링크 추가

**신규 — E2E (`apps/web/e2e/`)**
- `consumables.spec.ts` — CRUD(분류+장비 scope) · 403

---

## Task 1: `consumables.manage` capability 키 추가

**Files:**
- Modify: `packages/shared/src/permissions.ts`
- Modify: `packages/shared/src/permissions.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/shared/src/permissions.test.ts`

기존 "v1 registry는 7개" 테스트의 배열을 8개로 갱신하고, P-B 블록 아래에 consumables 블록 추가. 아래 두 군데를 수정/추가한다.

기존 블록 교체 (개수·이름):
```ts
  test("registry는 8개 capability 키를 정의한다", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        "applications.assign",
        "applications.view_all",
        "consumables.manage",
        "customers.manage",
        "email.send",
        "equipment.manage",
        "quotes.write",
        "users.manage",
      ].sort()
    );
  });
```

파일 끝에 블록 추가:
```ts
describe("consumables.manage capability (P-C)", () => {
  test("consumables.manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("consumables.manage");
  });
  test("users.manage 보유자는 consumables.manage도 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "consumables.manage")).toBe(true);
  });
  test("consumables.manage만 보유 시 통과, customers.manage 불가", () => {
    expect(can(["consumables.manage"], "consumables.manage")).toBe(true);
    expect(can(["consumables.manage"], "customers.manage")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test`
Expected: FAIL — registry는 8개 키 단언 불일치, `consumables.manage` 미존재.

- [ ] **Step 3: 구현** — `packages/shared/src/permissions.ts`

`PERMISSIONS` 배열에 `customers.manage` 줄 다음에 한 줄 추가:
```ts
  "consumables.manage", // 소모품 카탈로그 관리 (P-C)
```
주석 `/** v1 권한 키 (7개) ... */`를 `(8개)`로 갱신.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test`
Expected: PASS.

- [ ] **Step 5: 커밋**
```bash
git add packages/shared/src/permissions.ts packages/shared/src/permissions.test.ts
git commit -m "feat: consumables.manage capability 키 추가 (P-C)"
```

---

## Task 2: `consumables` 마스터 테이블 마이그레이션

**Files:**
- Create: `supabase/migrations/20260602100005_consumables.sql`
- Create: `supabase/rollback/20260602100005_consumables_down.sql`
- Test: `packages/db-tests/src/consumables.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/db-tests/src/consumables.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// admin=consumables.manage 보유, sales1=무권한
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cons-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cons-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
}

describe("consumables — RLS(consumables.manage 게이트)", () => {
  test("권한자 INSERT/UPDATE/DELETE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumables (name,unit) values ('UV잉크-시안','병') returning id", []);
      expect(r.rowCount).toBe(1);
      const id = r.rows[0].id as string;
      const u = await c.query("update public.consumables set sku='INK-C' where id=$1 returning id", [id]);
      expect(u.rowCount).toBe(1);
      const d = await c.query("delete from public.consumables where id=$1 returning id", [id]);
      expect(d.rowCount).toBe(1);
    });
  });

  test("무권한 sales INSERT 거부 / 로그인 전원 SELECT 가능 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumables (name) values ('금지')", [])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      // postgres로 한 행 심고
      await asPostgres(c);
      await c.query("insert into public.consumables (name) values ('세정액')", []);
      // 무권한 로그인도 SELECT는 가능(authenticated true)
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.consumables")).rowCount).toBeGreaterThan(0);
      // anon은 정책 없음 → 0행
      await asAnon(c);
      expect((await c.query("select id from public.consumables")).rowCount).toBe(0);
    });
  });

  test("created_at/updated_at은 트리거가 강제(클라 지정 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query(
        "insert into public.consumables (name,created_at) values ('a','2000-01-01') returning created_at",
        [],
      );
      // 트리거가 now()로 덮어씀 → 2000년이 아니어야 함
      expect(new Date(r.rows[0].created_at as string).getFullYear()).toBeGreaterThan(2020);
    });
  });

  test("status는 active|inactive만 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumables (name,status) values ('x','bogus')", [])).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumables.test.ts`
Expected: FAIL — `relation "public.consumables" does not exist`.

- [ ] **Step 3: 마이그레이션 작성** — `supabase/migrations/20260602100005_consumables.sql`

```sql
-- M2 P-C #21 — consumables(소모품 마스터). 컬러·품목 단위 1행.
-- 쓰기=consumables.manage(admin은 users.manage 자동), 읽기=authenticated 전원.
-- 서버통제값(created_at·updated_at)은 트리거 불변(P-B company_equipment 패턴).
create table public.consumables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  sku text,
  price numeric(14, 2),
  note text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumables_name_len check (char_length(name) <= 200),
  constraint consumables_unit_len check (unit is null or char_length(unit) <= 50),
  constraint consumables_sku_len check (sku is null or char_length(sku) <= 100),
  constraint consumables_note_len check (note is null or char_length(note) <= 2000)
);
create index consumables_status_idx on public.consumables (status);

create or replace function public.consumables_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger consumables_server_fields
  before insert or update on public.consumables
  for each row execute function public.consumables_enforce_server_fields();

alter table public.consumables enable row level security;
create policy consumables_select on public.consumables
  for select to authenticated using (true);
create policy consumables_insert on public.consumables
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumables_update on public.consumables
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumables_delete on public.consumables
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
```

롤백 — `supabase/rollback/20260602100005_consumables_down.sql`:
```sql
drop trigger if exists consumables_server_fields on public.consumables;
drop function if exists public.consumables_enforce_server_fields();
drop table if exists public.consumables cascade;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumables.test.ts`
Expected: PASS (4 테스트).

- [ ] **Step 5: 커밋**
```bash
git add supabase/migrations/20260602100005_consumables.sql supabase/rollback/20260602100005_consumables_down.sql packages/db-tests/src/consumables.test.ts
git commit -m "feat: consumables 마스터 테이블 + RLS (P-C)"
```

---

## Task 3: `consumable_scope` junction 마이그레이션 (분류 XOR 장비)

**Files:**
- Create: `supabase/migrations/20260602100006_consumable_scope.sql`
- Create: `supabase/rollback/20260602100006_consumable_scope_down.sql`
- Test: `packages/db-tests/src/consumable_scope.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/db-tests/src/consumable_scope.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

// 소모품 1건 + 장비 1건을 심고 consumable_id 반환. admin=consumables.manage.
async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "scope-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "scope-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'UV프린터A','UV프린터',1000,'active')", [EQ]);
  const r = await c.query("insert into public.consumables (name) values ('UV잉크') returning id", []);
  return r.rows[0].id as string;
}

describe("consumable_scope — 분류 XOR 장비 CHECK + RLS", () => {
  test("category만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터') returning id", [cid]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category,equipment_id) values ($1,'UV프린터',$2)", [cid, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  test("같은 소모품·분류 중복 → 거부(부분 UNIQUE)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await asAnon(c);
      expect((await c.query("select id from public.consumable_scope")).rowCount).toBe(0);
    });
  });
  test("consumable 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await c.query("delete from public.consumables where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.consumable_scope where consumable_id=$1", [cid])).rowCount).toBe(0);
    });
  });
  test("equipment 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ]);
      await c.query("delete from public.equipment where id=$1", [EQ]);
      await asPostgres(c);
      expect((await c.query("select id from public.consumable_scope where equipment_id=$1", [EQ])).rowCount).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumable_scope.test.ts`
Expected: FAIL — `relation "public.consumable_scope" does not exist`.

- [ ] **Step 3: 마이그레이션 작성** — `supabase/migrations/20260602100006_consumable_scope.sql`

```sql
-- M2 P-C #21 — consumable_scope(매핑). category XOR equipment_id = 정확히 하나(C2).
-- "모든 프린터" = category 2행. consumable·equipment 삭제 시 cascade.
-- id는 P-E item·이력 FK 대비 보존 → admin 저장은 diff-upsert(replace 금지).
create table public.consumable_scope (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.consumables (id) on delete cascade,
  category text,
  equipment_id uuid references public.equipment (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumable_scope_identity
    check ((category is not null) <> (equipment_id is not null)),
  constraint consumable_scope_category_len
    check (category is null or char_length(category) <= 100)
);
-- 부분 UNIQUE: 같은 소모품에 같은 분류/장비 중복 매핑 방지.
-- ⚠️ 부분 UNIQUE는 ON CONFLICT arbiter 미작동(42P10) — 저장은 id 보존 diff-upsert라 무관(무결성 가드 전용).
create unique index consumable_scope_uniq_equipment
  on public.consumable_scope (consumable_id, equipment_id) where equipment_id is not null;
create unique index consumable_scope_uniq_category
  on public.consumable_scope (consumable_id, category) where category is not null;
create index consumable_scope_consumable_idx on public.consumable_scope (consumable_id);
create index consumable_scope_equipment_idx on public.consumable_scope (equipment_id);
create index consumable_scope_category_idx on public.consumable_scope (category);

create or replace function public.consumable_scope_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger consumable_scope_server_fields
  before insert or update on public.consumable_scope
  for each row execute function public.consumable_scope_enforce_server_fields();

alter table public.consumable_scope enable row level security;
create policy consumable_scope_select on public.consumable_scope
  for select to authenticated using (true);
create policy consumable_scope_insert on public.consumable_scope
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_update on public.consumable_scope
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_delete on public.consumable_scope
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
```

롤백 — `supabase/rollback/20260602100006_consumable_scope_down.sql`:
```sql
drop trigger if exists consumable_scope_server_fields on public.consumable_scope;
drop function if exists public.consumable_scope_enforce_server_fields();
drop table if exists public.consumable_scope cascade;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumable_scope.test.ts`
Expected: PASS (8 테스트).

- [ ] **Step 5: 커밋**
```bash
git add supabase/migrations/20260602100006_consumable_scope.sql supabase/rollback/20260602100006_consumable_scope_down.sql packages/db-tests/src/consumable_scope.test.ts
git commit -m "feat: consumable_scope junction(분류 XOR 장비) + RLS (P-C)"
```

---

## Task 4: `consumables_for_equipment()` 해석 함수

**Files:**
- Create: `supabase/migrations/20260602100007_consumables_for_equipment.sql`
- Create: `supabase/rollback/20260602100007_consumables_for_equipment_down.sql`
- Test: `packages/db-tests/src/consumables_for_equipment.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/db-tests/src/consumables_for_equipment.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ_A = "00000000-0000-0000-0000-0000000000e1"; // UV프린터A
const EQ_B = "00000000-0000-0000-0000-0000000000e2"; // 커팅기B

async function seed(): Promise<{ ink: string; clean: string; blade: string; inactive: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cfe-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'UV프린터A','UV프린터',1000,'active')", [EQ_A]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'커팅기B','커팅기',1000,'active')", [EQ_B]);
  const ink = (await c.query("insert into public.consumables (name) values ('UV잉크') returning id", [])).rows[0].id as string;
  const clean = (await c.query("insert into public.consumables (name) values ('세정액') returning id", [])).rows[0].id as string;
  const blade = (await c.query("insert into public.consumables (name,equipment_id_hint) values ('A전용부품',null) returning id", []).catch(async () => {
    // equipment_id_hint 컬럼 없음(스키마에 없음) — 일반 insert로 폴백
    return c.query("insert into public.consumables (name) values ('A전용부품') returning id", []);
  })).rows[0].id as string;
  const inactive = (await c.query("insert into public.consumables (name,status) values ('단종잉크','inactive') returning id", [])).rows[0].id as string;
  // UV잉크 → 분류 'UV프린터'
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [ink]);
  // 세정액 → 분류 'UV프린터' + '커팅기' (모든 장비 공통 예시)
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [clean]);
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'커팅기')", [clean]);
  // A전용부품 → 장비 EQ_A 직접
  await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [blade, EQ_A]);
  // 단종잉크 → 분류 'UV프린터'지만 inactive → 결과 제외
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [inactive]);
  return { ink, clean, blade, inactive };
}

describe("consumables_for_equipment — 분류공통 + 장비전용 dedup·active", () => {
  test("UV프린터A → UV잉크·세정액·A전용부품(active), 단종 제외", async () => {
    await inRollbackTx(c, async () => {
      const { inactive } = await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1) order by name", [EQ_A]);
      const names = r.rows.map((x: { name: string }) => x.name);
      expect(names).toEqual(["A전용부품", "UV잉크", "세정액"].sort());
      expect(names).not.toContain("단종잉크");
      // inactive id가 결과에 없음
      const ids = (await c.query("select id from public.consumables_for_equipment($1)", [EQ_A])).rows.map((x: { id: string }) => x.id);
      expect(ids).not.toContain(inactive);
    });
  });

  test("커팅기B → 세정액만(분류 '커팅기' 공통)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_B]);
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["세정액"]);
    });
  });

  test("매핑 중복 없이 1행으로 dedup (세정액이 분류·장비 양쪽 매핑돼도 1건)", async () => {
    await inRollbackTx(c, async () => {
      const { clean } = await seed();
      await asUser(c, UID.admin);
      // 세정액에 EQ_A 장비 직접 매핑도 추가 → 분류+장비 양쪽
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [clean, EQ_A]);
      const r = await c.query("select id from public.consumables_for_equipment($1) where id=$2", [EQ_A, clean]);
      expect(r.rowCount).toBe(1); // 중복 제거 확인
    });
  });
});
```

> 참고: 위 테스트의 `equipment_id_hint` 폴백은 스키마에 그 컬럼이 없으므로 catch 경로(일반 insert)로 동작한다. 가독성을 위해 구현 시 단순 `insert into public.consumables (name) values ('A전용부품')` 한 줄로 정리해도 된다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumables_for_equipment.test.ts`
Expected: FAIL — `function public.consumables_for_equipment(uuid) does not exist`.

- [ ] **Step 3: 마이그레이션 작성** — `supabase/migrations/20260602100007_consumables_for_equipment.sql`

```sql
-- M2 P-C #21 — 해석 함수: 주어진 장비에 매칭되는 active 소모품을 dedup 반환.
-- scope.equipment_id = 장비 OR scope.category = 장비의 category. P-C admin 미리보기 + P-E 재사용.
-- SECURITY DEFINER + search_path='' (E1 표준). 읽기 전용이라 STABLE.
create or replace function public.consumables_for_equipment(p_equipment_id uuid)
returns setof public.consumables
language sql
security definer
set search_path = ''
stable
as $$
  select distinct cn.*
  from public.consumables cn
  join public.consumable_scope cs on cs.consumable_id = cn.id
  where cn.status = 'active'
    and (
      cs.equipment_id = p_equipment_id
      or cs.category = (select e.category from public.equipment e where e.id = p_equipment_id)
    );
$$;
-- authenticated 호출 허용(읽기). anon 노출은 P-E에서 별도 RPC로 결정(여기선 미부여).
grant execute on function public.consumables_for_equipment(uuid) to authenticated;
```

롤백 — `supabase/rollback/20260602100007_consumables_for_equipment_down.sql`:
```sql
drop function if exists public.consumables_for_equipment(uuid);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumables_for_equipment.test.ts`
Expected: PASS (3 테스트).

- [ ] **Step 5: 전체 db-tests 회귀 확인**

Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: PASS (기존 + 신규 전부).

- [ ] **Step 6: 커밋**
```bash
git add supabase/migrations/20260602100007_consumables_for_equipment.sql supabase/rollback/20260602100007_consumables_for_equipment_down.sql packages/db-tests/src/consumables_for_equipment.test.ts
git commit -m "feat: consumables_for_equipment 해석 함수 (P-C)"
```

---

## Task 5: scope diff 순수 로직

**Files:**
- Create: `apps/web/src/lib/consumables/scope-diff.ts`
- Test: `apps/web/src/lib/consumables/scope-diff.test.ts`

> P-B `lib/customers/equipment-diff.ts`의 직접 미러. category XOR equipment_id로 필드만 교체.

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/lib/consumables/scope-diff.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { diffScopes, toScopeDbRow } from "./scope-diff";
import type { ConsumableScopeRow } from "./schema";

const CID = "11111111-1111-1111-1111-111111111111";
const EQ = "22222222-2222-2222-2222-222222222222";
const ID1 = "33333333-3333-3333-3333-333333333333";

function row(p: Partial<ConsumableScopeRow>): ConsumableScopeRow {
  return { id: "", category: "", equipment_id: "", ...p };
}

describe("toScopeDbRow — category XOR equipment_id", () => {
  test("equipment_id 있으면 category는 null 강제", () => {
    expect(toScopeDbRow(CID, row({ equipment_id: EQ, category: "무시됨" }))).toEqual({
      consumable_id: CID, category: null, equipment_id: EQ,
    });
  });
  test("category만 있으면 equipment_id는 null", () => {
    expect(toScopeDbRow(CID, row({ category: "UV프린터" }))).toEqual({
      consumable_id: CID, category: "UV프린터", equipment_id: null,
    });
  });
});

describe("diffScopes — id 보존 분리", () => {
  test("기존에 없는 id는 삭제, id 있으면 업데이트, id 없으면 신규", () => {
    const existing = [ID1, "44444444-4444-4444-4444-444444444444"];
    const submitted: ConsumableScopeRow[] = [
      row({ id: ID1, category: "UV프린터" }), // 업데이트
      row({ equipment_id: EQ }), // 신규
    ];
    const { toDelete, toUpdate, toInsert } = diffScopes(CID, existing, submitted);
    expect(toDelete).toEqual(["44444444-4444-4444-4444-444444444444"]);
    expect(toUpdate).toEqual([{ id: ID1, consumable_id: CID, category: "UV프린터", equipment_id: null }]);
    expect(toInsert).toEqual([{ consumable_id: CID, category: null, equipment_id: EQ }]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- scope-diff`
Expected: FAIL — `Cannot find module './scope-diff'` (및 './schema').

- [ ] **Step 3: 구현** — `apps/web/src/lib/consumables/scope-diff.ts`

```ts
// 소모품 scope diff 순수 로직 — 사이드이펙트 없음(서버 모듈 아님).
// actions.ts("use server")에서 import. P-B equipment-diff.ts 미러.
import type { ConsumableScopeRow } from "@/lib/consumables/schema";

// DB row 변환 — equipment_id 있으면 category는 null 강제(XOR 보장).
export function toScopeDbRow(consumable_id: string, r: ConsumableScopeRow) {
  return {
    consumable_id,
    category: r.equipment_id ? null : r.category || null,
    equipment_id: r.equipment_id || null,
  };
}

// id 보존 diff — 삭제·업데이트·신규를 분리. replace(전량 삭제 후 재삽입) 금지.
export function diffScopes(
  consumable_id: string,
  existing: string[],
  submitted: ConsumableScopeRow[],
) {
  const submittedIds = new Set(submitted.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((id) => !submittedIds.has(id));
  const toUpdate = submitted
    .filter((r) => r.id)
    .map((r) => ({ id: r.id, ...toScopeDbRow(consumable_id, r) }));
  const toInsert = submitted.filter((r) => !r.id).map((r) => toScopeDbRow(consumable_id, r));
  return { toDelete, toUpdate, toInsert };
}
```

> `./schema`는 Task 6에서 생성. 이 테스트는 Task 6 완료 후 함께 통과한다. Task 5 커밋 전 Task 6 schema를 먼저 만들어도 되고, 두 태스크를 한 커밋으로 묶어도 된다. 순서상 Step 4는 Task 6 이후 재확인.

- [ ] **Step 4: (Task 6 schema 생성 후) 테스트 통과 확인**

Run: `pnpm --filter web test -- scope-diff`
Expected: PASS.

- [ ] **Step 5: 커밋** (Task 6과 묶어 커밋 가능)
```bash
git add apps/web/src/lib/consumables/scope-diff.ts apps/web/src/lib/consumables/scope-diff.test.ts
git commit -m "feat: 소모품 scope diff 순수 로직 (P-C)"
```

---

## Task 6: 소모품 zod 스키마

**Files:**
- Create: `apps/web/src/lib/consumables/schema.ts`
- Test: `apps/web/src/lib/consumables/schema.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `apps/web/src/lib/consumables/schema.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { consumableFormSchema, consumableScopeRowSchema } from "./schema";

describe("consumableScopeRowSchema — category XOR equipment_id", () => {
  const base = { id: "", category: "", equipment_id: "" };
  test("category만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category: "UV프린터" }).success).toBe(true);
  });
  test("equipment_id만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, equipment_id: "22222222-2222-2222-2222-222222222222" }).success).toBe(true);
  });
  test("둘 다 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category: "UV프린터", equipment_id: "22222222-2222-2222-2222-222222222222" }).success).toBe(false);
  });
  test("둘 다 없음 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse(base).success).toBe(false);
  });
});

describe("consumableFormSchema", () => {
  test("name 필수", () => {
    expect(consumableFormSchema.safeParse({ name: "" }).success).toBe(false);
  });
  test("최소 폼(name만) → 기본값 채워짐", () => {
    const r = consumableFormSchema.safeParse({ name: "세정액" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("active");
      expect(r.data.scopes).toEqual([]);
      expect(r.data.price).toBe("");
    }
  });
  test("price는 빈 값 또는 0 이상 숫자만", () => {
    expect(consumableFormSchema.safeParse({ name: "x", price: "abc" }).success).toBe(false);
    expect(consumableFormSchema.safeParse({ name: "x", price: "-5" }).success).toBe(false);
    expect(consumableFormSchema.safeParse({ name: "x", price: "1500" }).success).toBe(true);
    expect(consumableFormSchema.safeParse({ name: "x", price: "" }).success).toBe(true);
  });
  test("status는 active|inactive만", () => {
    expect(consumableFormSchema.safeParse({ name: "x", status: "bogus" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- consumables/schema`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/consumables/schema.ts`

```ts
import { z } from "zod";

// 소모품 매핑 행 — 분류(category) 또는 특정 장비(equipment_id) 중 하나만(XOR).
export const consumableScopeRowSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")), // 기존 uuid 또는 "" (신규)
    category: z.string().trim().max(100, "100자 이내"),
    equipment_id: z.string().uuid().or(z.literal("")),
  })
  .refine(
    (r) => (r.category !== "") !== (r.equipment_id !== ""),
    "분류 또는 특정 장비 중 하나만 지정하세요",
  );

// 가격 — 빈 값 허용(선택). 값이 있으면 0 이상 숫자.
const priceOptional = z
  .string()
  .trim()
  .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "0 이상 숫자만 입력하세요");

// 소모품 폼 — 클라이언트(react-hook-form)와 서버액션 재검증이 공유.
export const consumableFormSchema = z.object({
  name: z.string().trim().min(1, "소모품명을 입력하세요").max(200, "200자 이내"),
  unit: z.string().trim().max(50, "50자 이내").default(""),
  sku: z.string().trim().max(100, "100자 이내").default(""),
  price: priceOptional.default(""),
  note: z.string().trim().max(2000, "2000자 이내").default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  scopes: z.array(consumableScopeRowSchema).default([]),
});

export type ConsumableFormValues = z.infer<typeof consumableFormSchema>;
export type ConsumableScopeRow = z.infer<typeof consumableScopeRowSchema>;
```

- [ ] **Step 4: 테스트 통과 확인 (schema + scope-diff 함께)**

Run: `pnpm --filter web test -- consumables`
Expected: PASS (schema 테스트 + Task 5 scope-diff 테스트 모두).

- [ ] **Step 5: 커밋**
```bash
git add apps/web/src/lib/consumables/schema.ts apps/web/src/lib/consumables/schema.test.ts
git commit -m "feat: 소모품 폼 zod 스키마 (P-C)"
```

---

## Task 7: guard + queries (server)

**Files:**
- Modify: `apps/web/src/lib/auth/guard.ts`
- Create: `apps/web/src/lib/consumables/queries.ts`

> queries는 RLS/E2E로 검증(순수 단위 테스트 없음 — DB 접근 모듈). 타입·typecheck로 1차 보증.

- [ ] **Step 1: guard에 헬퍼 추가** — `apps/web/src/lib/auth/guard.ts`

파일 끝의 `requireCustomersManage` 줄 다음에 추가:
```ts
export const requireConsumablesManage = () => requirePermission("consumables.manage");
```

- [ ] **Step 2: queries 구현** — `apps/web/src/lib/consumables/queries.ts`

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 목록 행 — 소모품 + 매핑 요약.
export interface ConsumableListRow {
  id: string;
  name: string;
  unit: string | null;
  sku: string | null;
  status: "active" | "inactive";
  scope_count: number;
  scope_summary: string; // "UV프린터 외 2건" / "-"
  updated_at: string;
}

// 소모품 목록 — 최신순. RLS: consumables.manage 보유자만 접근.
// consumable_scope 임베드(category + 장비명)로 범위 요약 구성.
export async function listConsumables(): Promise<ConsumableListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consumables")
    .select("id,name,unit,sku,status,updated_at,consumable_scope(category,equipment_id,equipment:equipment_id(name))")
    .order("updated_at", { ascending: false });
  if (error) { console.error("[consumables.list]", error); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => {
    const scopes = (r.consumable_scope as Array<{ category: string | null; equipment: { name?: string } | null }> | null) ?? [];
    const labels = scopes
      .map((s) => s.category ?? s.equipment?.name ?? null)
      .filter((x): x is string => !!x);
    const scope_summary =
      labels.length === 0 ? "-" : labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}건`;
    return {
      id: r.id as string,
      name: r.name as string,
      unit: r.unit as string | null,
      sku: r.sku as string | null,
      status: r.status as "active" | "inactive",
      scope_count: labels.length,
      scope_summary,
      updated_at: r.updated_at as string,
    };
  });
}

// 소모품 단건 — 매핑 포함. 수정 폼에서 사용.
export async function getConsumable(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("consumables")
    .select("*, consumable_scope(*)")
    .eq("id", id)
    .single();
  return data;
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (에러 0).

- [ ] **Step 4: 커밋**
```bash
git add apps/web/src/lib/auth/guard.ts apps/web/src/lib/consumables/queries.ts
git commit -m "feat: 소모품 guard·queries (P-C)"
```

---

## Task 8: server actions (create/update/delete + applyScopeDiff)

**Files:**
- Create: `apps/web/src/lib/consumables/actions.ts`

> P-B `lib/customers/actions.ts` 미러. 단, 소모품은 unique 제약 없음 → 23505 처리 불필요.

- [ ] **Step 1: 구현** — `apps/web/src/lib/consumables/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { consumableFormSchema, type ConsumableFormValues } from "@/lib/consumables/schema";
import { diffScopes } from "@/lib/consumables/scope-diff";

export type ConsumableActionResult = { error: string } | null;

// scope diff-upsert — 삭제→업데이트→신규 순. diff 순수 로직은 scope-diff.ts.
// RLS는 consumables.manage만 검사 → row 소유(consumable_id 스코프)는 앱에서 강제.
async function applyScopeDiff(
  supabase: SupabaseClient,
  consumableId: string,
  values: ConsumableFormValues,
): Promise<string | null> {
  const { data: existingRows, error: exErr } = await supabase
    .from("consumable_scope").select("id").eq("consumable_id", consumableId);
  if (exErr) return exErr.message;
  const { toDelete, toUpdate, toInsert } = diffScopes(
    consumableId,
    (existingRows ?? []).map((r: { id: string }) => r.id),
    values.scopes,
  );
  if (toDelete.length) {
    const { error } = await supabase.from("consumable_scope").delete().in("id", toDelete);
    if (error) return error.message;
  }
  const ownedIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    if (!ownedIds.has(id)) continue; // 위조·타 소모품 id 무시
    const { error } = await supabase
      .from("consumable_scope").update(rest).eq("id", id).eq("consumable_id", consumableId);
    if (error) return error.message;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("consumable_scope").insert(toInsert);
    if (error) return error.message;
  }
  return null;
}

// 소모품 row 변환 — 빈 문자열은 null, price는 숫자 또는 null.
function consumableRow(v: ConsumableFormValues) {
  return {
    name: v.name,
    unit: v.unit || null,
    sku: v.sku || null,
    price: v.price === "" ? null : Number(v.price),
    note: v.note || null,
    status: v.status,
  };
}

// 신규 등록. id는 클라에서 생성한 UUID. scope 저장 실패 시 보상 삭제.
export async function createConsumable(id: string, values: ConsumableFormValues): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = consumableFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("consumables").insert({ id, ...consumableRow(v) });
  if (error) { console.error("[consumables.create] insert 실패", error); return { error: "저장하지 못했습니다." }; }
  const scopeErr = await applyScopeDiff(supabase, id, v);
  if (scopeErr) {
    console.error("[consumables.create] scope 저장 실패, 보상 삭제", scopeErr);
    await supabase.from("consumables").delete().eq("id", id);
    return { error: "매핑을 저장하지 못했습니다." };
  }
  revalidatePath("/admin/consumables");
  redirect(`/admin/consumables/${id}/edit`);
}

// 수정. 0행 업데이트 = 동시 삭제 감지.
export async function updateConsumable(id: string, values: ConsumableFormValues): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = consumableFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("consumables").update(consumableRow(v)).eq("id", id).select("id");
  if (error) { console.error("[consumables.update] update 실패", error); return { error: "저장하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  const scopeErr = await applyScopeDiff(supabase, id, v);
  if (scopeErr) { console.error("[consumables.update] scope 저장 실패", scopeErr); return { error: "매핑을 저장하지 못했습니다." }; }
  revalidatePath("/admin/consumables");
  redirect("/admin/consumables");
}

// 삭제. consumable_scope는 FK cascade로 자동 삭제.
export async function deleteConsumable(id: string): Promise<ConsumableActionResult> {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("consumables").delete().eq("id", id).select("id");
  if (error) { console.error("[consumables.delete] delete 실패", error); return { error: "삭제하지 못했습니다." }; }
  if (!data || data.length === 0) return { error: "이미 삭제되었거나 없는 항목입니다." };
  revalidatePath("/admin/consumables");
  redirect("/admin/consumables");
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: 커밋**
```bash
git add apps/web/src/lib/consumables/actions.ts
git commit -m "feat: 소모품 server actions(diff-upsert) (P-C)"
```

---

## Task 9: scope 에디터 + 폼 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/consumables/_components/ConsumableScopeEditor.tsx`
- Create: `apps/web/src/app/admin/consumables/_components/ConsumableForm.tsx`

> 에디터는 P-B `CompanyEquipmentEditor` 미러(토글 모드 catalog→equipment / direct→category). 폼은 `CompanyForm` 미러.

- [ ] **Step 1: scope 에디터 구현** — `_components/ConsumableScopeEditor.tsx`

```tsx
"use client";
import { useState } from "react";
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import type { z } from "zod";
import type { consumableFormSchema } from "@/lib/consumables/schema";

type FormInput = z.input<typeof consumableFormSchema>;
type CatalogItem = { id: string; name: string; model: string | null };

// 매핑 에디터 — 분류(category) vs 특정 장비(equipment_id) 토글.
// XOR 보장: 분류 선택 시 equipment_id 무효화, 장비 선택 시 category 무효화.
// 기존 행은 hidden input으로 id 보존 → diff-upsert 키.
export function ConsumableScopeEditor({
  control,
  register,
  setValue,
  catalog,
  categories,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
  categories: string[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "scopes" });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">적용 범위</h2>
        <button
          type="button"
          onClick={() => append({ id: "", category: "", equipment_id: "" })}
          className="text-small font-medium text-accent hover:underline"
        >
          + 범위 추가
        </button>
      </div>
      <p className="text-micro text-muted">
        분류를 선택하면 그 분류의 모든 장비에 자동 적용됩니다. 특정 모델 전용이면 장비를 직접 선택하세요.
      </p>

      {fields.length === 0 ? (
        <p className="text-small text-muted">적용 범위가 없습니다 — 이 소모품은 어떤 장비에도 매칭되지 않습니다</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <ScopeRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              setValue={setValue}
              catalog={catalog}
              categories={categories}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ScopeRow({
  index, control, register, setValue, catalog, categories, onRemove,
}: {
  index: number;
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
  categories: string[];
  onRemove: () => void;
}) {
  // 초기 모드: equipment_id 있으면 장비, 아니면 분류(신규 행 기본=분류).
  const initialEquipmentId = useWatch({ control, name: `scopes.${index}.equipment_id` });
  const [mode, setMode] = useState<"category" | "equipment">(() =>
    initialEquipmentId ? "equipment" : "category",
  );

  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex gap-1 self-start">
        {(["category", "equipment"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              // 반대 필드 초기화 — RHF는 언마운트 input 값을 보존하므로 명시적으로 비워 XOR 보장.
              if (m === "category") setValue(`scopes.${index}.equipment_id`, "");
              else setValue(`scopes.${index}.category`, "");
              setMode(m);
            }}
            className={`rounded-sm px-2 py-1 text-small font-medium ${
              mode === m ? "bg-accent text-white" : "bg-surface-2 text-muted"
            }`}
          >
            {m === "category" ? "분류" : "특정 장비"}
          </button>
        ))}
      </div>

      {mode === "category" ? (
        <select
          {...register(`scopes.${index}.category`)}
          className="min-w-[180px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        >
          <option value="">분류 선택…</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      ) : (
        <select
          {...register(`scopes.${index}.equipment_id`)}
          className="min-w-[180px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        >
          <option value="">장비 선택…</option>
          {catalog.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}{eq.model ? ` (${eq.model})` : ""}
            </option>
          ))}
        </select>
      )}

      <input type="hidden" {...register(`scopes.${index}.id`)} />

      <button
        type="button"
        onClick={onRemove}
        aria-label="범위 행 삭제"
        className="self-start px-1 text-danger hover:underline"
      >
        ✕
      </button>
    </li>
  );
}
```

- [ ] **Step 2: 폼 구현** — `_components/ConsumableForm.tsx`

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { consumableFormSchema, type ConsumableFormValues } from "@/lib/consumables/schema";
import type { ConsumableActionResult } from "@/lib/consumables/actions";
import { ConsumableScopeEditor } from "./ConsumableScopeEditor";

type CatalogItem = { id: string; name: string; model: string | null };
type ConsumableAction = (id: string, values: ConsumableFormValues) => Promise<ConsumableActionResult>;

type Props =
  | { mode: "create"; id: string; onSubmit: ConsumableAction; catalog: CatalogItem[]; categories: string[]; consumable?: never }
  | { mode: "edit"; id: string; onSubmit: ConsumableAction; catalog: CatalogItem[]; categories: string[]; consumable: ConsumableFormValues };

type FormInput = z.input<typeof consumableFormSchema>;

export function ConsumableForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultValues: FormInput =
    props.mode === "edit"
      ? { ...props.consumable, scopes: props.consumable.scopes.map((s) => ({ id: s.id, category: s.category, equipment_id: s.equipment_id })) }
      : { name: "", unit: "", sku: "", price: "", note: "", status: "active", scopes: [] };

  const {
    register, handleSubmit, control, setValue,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, ConsumableFormValues>({
    resolver: zodResolver(consumableFormSchema),
    defaultValues,
  });

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function onSubmit(values: ConsumableFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await props.onSubmit(props.id, values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <section className="flex flex-col gap-5">
          <Field label="소모품명 *" error={errors.name?.message}>
            <input {...register("name")} className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text" />
          </Field>
          <Field label="단위" error={errors.unit?.message}>
            <input {...register("unit")} placeholder="개 / 병 / L / 롤" className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text" />
          </Field>
          <Field label="품번(SKU)" error={errors.sku?.message}>
            <input {...register("sku")} className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text" />
          </Field>
          <Field label="가격(내부용)" error={errors.price?.message}>
            <input {...register("price")} inputMode="decimal" placeholder="비공개 참고가" className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text" />
          </Field>
          <Field label="상태" error={errors.status?.message}>
            <select {...register("status")} className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text">
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </Field>
          <Field label="메모" error={errors.note?.message}>
            <textarea {...register("note")} rows={3} className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text" />
          </Field>
        </section>

        <ConsumableScopeEditor
          control={control}
          register={register}
          setValue={setValue}
          catalog={props.catalog}
          categories={props.categories}
        />

        {serverError ? <p className="text-small text-danger">{serverError}</p> : null}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60">
            {pending ? "저장 중…" : "저장"}
          </button>
          <button type="button" onClick={() => router.push("/admin/consumables")} className="text-small text-muted hover:text-text">취소</button>
          {props.mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                if (!confirm("이 소모품을 삭제할까요? 매핑도 함께 삭제됩니다.")) return;
                startTransition(async () => {
                  const { deleteConsumable } = await import("@/lib/consumables/actions");
                  const result = await deleteConsumable(props.id);
                  if (result?.error) setServerError(result.error);
                });
              }}
              disabled={pending}
              className="ml-auto text-small text-danger hover:underline"
            >
              삭제
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-small text-muted">{label}</span>
      {children}
      {error ? <span className="text-micro text-danger">{error}</span> : null}
    </label>
  );
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: 커밋**
```bash
git add apps/web/src/app/admin/consumables/_components/ConsumableScopeEditor.tsx apps/web/src/app/admin/consumables/_components/ConsumableForm.tsx
git commit -m "feat: 소모품 scope 에디터·폼 컴포넌트 (P-C)"
```

---

## Task 10: 목록 테이블 + 페이지(list/new/edit) + nav 링크

**Files:**
- Create: `apps/web/src/app/admin/consumables/_components/ConsumableTable.tsx`
- Create: `apps/web/src/app/admin/consumables/page.tsx`
- Create: `apps/web/src/app/admin/consumables/loading.tsx`
- Create: `apps/web/src/app/admin/consumables/error.tsx`
- Create: `apps/web/src/app/admin/consumables/new/page.tsx`
- Create: `apps/web/src/app/admin/consumables/new/NewConsumableClient.tsx`
- Create: `apps/web/src/app/admin/consumables/[id]/edit/page.tsx`
- Create: `apps/web/src/app/admin/consumables/[id]/edit/loading.tsx`
- Create: `apps/web/src/app/admin/consumables/[id]/edit/error.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: 목록 테이블** — `_components/ConsumableTable.tsx`

```tsx
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ConsumableListRow } from "@/lib/consumables/queries";

type StatusFilter = "all" | "active" | "inactive";

export function ConsumableTable({ items }: { items: ConsumableListRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.name.toLowerCase().includes(needle) ||
        (it.sku ?? "").toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || it.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [items, q, statusFilter]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 소모품이 없습니다</p>
        <Link href="/admin/consumables/new" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">+ 새 소모품</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="소모품명·품번 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                statusFilter === f ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {f === "all" ? "전체" : f === "active" ? "활성" : "비활성"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 소모품이 없습니다</p>
          <button onClick={() => { setQ(""); setStatusFilter("all"); }} className="text-small text-accent underline">필터 초기화</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">소모품명</th>
                <th className="py-2 pr-4 font-medium">단위</th>
                <th className="py-2 pr-4 font-medium">품번</th>
                <th className="py-2 pr-4 font-medium">적용 범위</th>
                <th className="py-2 pr-4 font-medium">상태</th>
                <th className="py-2 font-medium">최근수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="cursor-pointer border-b border-border hover:bg-surface-2"
                  onClick={() => router.push(`/admin/consumables/${it.id}/edit`)}
                >
                  <td className="max-w-xs py-2 pr-4">
                    <Link href={`/admin/consumables/${it.id}/edit`} className="block max-w-xs truncate font-medium text-text hover:text-accent">{it.name}</Link>
                  </td>
                  <td className="py-2 pr-4 text-text">{it.unit ?? <span className="text-muted">-</span>}</td>
                  <td className="py-2 pr-4">{it.sku ? <span className="font-mono tabular-nums text-text">{it.sku}</span> : <span className="text-muted">-</span>}</td>
                  <td className="py-2 pr-4">
                    {it.scope_count === 0
                      ? <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">미지정</span>
                      : <span className="text-text">{it.scope_summary}</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {it.status === "active"
                      ? <span className="rounded-sm bg-active/10 px-2 py-0.5 text-small font-medium text-active">활성</span>
                      : <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-small font-medium text-muted">비활성</span>}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-muted">{new Date(it.updated_at).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 목록 페이지** — `page.tsx`

```tsx
import Link from "next/link";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { listConsumables } from "@/lib/consumables/queries";
import { ConsumableTable } from "./_components/ConsumableTable";
import { signOut } from "@/app/login/actions";

// ⚠️ admin/layout은 equipment.manage 전용 가드 → consumables.manage 별도 확인 필수.
export default async function ConsumablesListPage() {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return <Forbidden />;
  const items = await listConsumables();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">소모품</h1>
        <Link href="/admin/consumables/new" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">+ 새 소모품</Link>
      </div>
      <ConsumableTable items={items} />
    </section>
  );
}

function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
      <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
      <p className="text-small text-muted">소모품 관리 권한(consumables.manage)이 필요합니다. 관리자에게 문의하세요.</p>
      <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
    </main>
  );
}
```

- [ ] **Step 3: loading/error** — `loading.tsx` 와 `error.tsx`

`loading.tsx`:
```tsx
export default function Loading() {
  return <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />;
}
```

`error.tsx`:
```tsx
"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10">
      <p className="text-body text-text">소모품을 불러오지 못했습니다</p>
      <button onClick={reset} className="text-small text-accent underline">다시 시도</button>
    </div>
  );
}
```
> `[id]/edit/loading.tsx`·`[id]/edit/error.tsx`도 동일 내용으로 생성(문구만 "소모품 정보").

- [ ] **Step 4: new 페이지 + 클라이언트 래퍼** — `new/page.tsx`, `new/NewConsumableClient.tsx`

`new/page.tsx`:
```tsx
import { requireConsumablesManage } from "@/lib/auth/guard";
import { listEquipment } from "@/lib/equipment/queries";
import { NewConsumableClient } from "./NewConsumableClient";
import { signOut } from "@/app/login/actions";

export default async function NewConsumablePage() {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">소모품 관리 권한(consumables.manage)이 필요합니다.</p>
        <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
      </main>
    );
  }
  const equipmentAll = await listEquipment();
  const active = equipmentAll.filter((e) => e.status === "active");
  const catalog = active.map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));
  const categories = [...new Set(active.map((e) => e.category).filter((x): x is string => !!x))].sort();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">소모품 추가</h1>
      <NewConsumableClient catalog={catalog} categories={categories} />
    </section>
  );
}
```

`new/NewConsumableClient.tsx`:
```tsx
"use client";
import { useState } from "react";
import { ConsumableForm } from "../_components/ConsumableForm";
import { createConsumable } from "@/lib/consumables/actions";

type CatalogItem = { id: string; name: string; model: string | null };

export function NewConsumableClient({ catalog, categories }: { catalog: CatalogItem[]; categories: string[] }) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <ConsumableForm mode="create" id={id} onSubmit={createConsumable} catalog={catalog} categories={categories} />
  );
}
```

- [ ] **Step 5: edit 페이지** — `[id]/edit/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { getConsumable } from "@/lib/consumables/queries";
import { listEquipment } from "@/lib/equipment/queries";
import { updateConsumable } from "@/lib/consumables/actions";
import type { ConsumableFormValues } from "@/lib/consumables/schema";
import { ConsumableForm } from "../../_components/ConsumableForm";
import { signOut } from "@/app/login/actions";

export default async function EditConsumablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">소모품 관리 권한(consumables.manage)이 필요합니다.</p>
        <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
      </main>
    );
  }

  const [consumable, equipmentAll] = await Promise.all([getConsumable(id), listEquipment()]);
  if (!consumable) notFound();

  const active = equipmentAll.filter((e) => e.status === "active");
  const catalog = active.map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));
  const categories = [...new Set(active.map((e) => e.category).filter((x): x is string => !!x))].sort();

  const scopesRaw = (consumable as { consumable_scope?: unknown[] }).consumable_scope ?? [];
  const scopes = (scopesRaw as Array<Record<string, unknown>>).map((s) => ({
    id: (s.id as string) ?? "",
    category: (s.category as string) ?? "",
    equipment_id: (s.equipment_id as string) ?? "",
  }));

  const priceRaw = (consumable as { price?: number | string | null }).price;
  const values: ConsumableFormValues = {
    name: (consumable as { name: string }).name,
    unit: (consumable as { unit?: string | null }).unit ?? "",
    sku: (consumable as { sku?: string | null }).sku ?? "",
    price: priceRaw === null || priceRaw === undefined ? "" : String(priceRaw),
    note: (consumable as { note?: string | null }).note ?? "",
    status: (consumable as { status: "active" | "inactive" }).status,
    scopes,
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">소모품 수정</h1>
      <ConsumableForm mode="edit" id={id} onSubmit={updateConsumable} catalog={catalog} categories={categories} consumable={values} />
    </section>
  );
}
```

`[id]/edit/loading.tsx` 와 `[id]/edit/error.tsx`는 Step 3의 내용 재사용(문구 "소모품 정보").

- [ ] **Step 6: nav 링크 추가** — `apps/web/src/app/admin/layout.tsx`

사이드바 `<nav>` 안, "고객" Link 다음에 추가:
```tsx
          <Link
            href="/admin/consumables"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            소모품
          </Link>
```

- [ ] **Step 7: typecheck + lint + build**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: 모두 PASS, `as any` 0.

- [ ] **Step 8: 커밋**
```bash
git add apps/web/src/app/admin/consumables apps/web/src/app/admin/layout.tsx
git commit -m "feat: 소모품 admin UI(목록·생성·수정·nav) (P-C)"
```

---

## Task 11: E2E 시나리오

**Files:**
- Create: `apps/web/e2e/consumables.spec.ts`

> P-B `customers.spec.ts`의 로그인·serviceRoleFetch·정리 패턴 미러. equipment를 service_role로 시드해 분류·장비 scope를 안정적으로 만든다.

- [ ] **Step 1: E2E 작성** — `apps/web/e2e/consumables.spec.ts`

```ts
import { test, expect } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────────────
// 소모품 카탈로그 E2E — CRUD(분류+장비 scope) · 403 권한 차단
// ──────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const SALES_EMAIL = "sales@jhtech.local";
const SALES_PASSWORD = "jhtech-sales-dev";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const E2E_CATEGORY = "E2E분류프린터";
const E2E_EQUIPMENT_NAME = "E2E장비-소모품용";
const CONS_NAME = "E2E소모품-테스트잉크";

async function serviceRoleFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// 이전 실행 잔여 정리 + E2E 장비 1건 시드(분류 scope·장비 scope 양쪽 테스트용).
async function resetAndSeed(): Promise<string> {
  // 소모품 정리(cascade로 scope 동반 삭제)
  await serviceRoleFetch(`/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`, { method: "DELETE" });
  // 장비 정리 후 재생성
  await serviceRoleFetch(`/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`, { method: "DELETE" });
  const res = await serviceRoleFetch(`/rest/v1/equipment`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: E2E_EQUIPMENT_NAME, category: E2E_CATEGORY, base_price: 1000, status: "active" }),
  });
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0].id;
}

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/이메일/).fill(email);
  await page.getByLabel(/비밀번호/).fill(password);
  await page.getByRole("button", { name: /로그인/ }).click();
}

test.describe("소모품 CRUD (admin)", () => {
  test.beforeAll(async () => { await resetAndSeed(); });
  test.afterAll(async () => {
    await serviceRoleFetch(`/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`, { method: "DELETE" });
    await serviceRoleFetch(`/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`, { method: "DELETE" });
  });

  test("생성 → 분류·장비 scope 매핑 → 목록 표시 → 삭제", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // 생성
    await page.goto("/admin/consumables/new");
    await page.getByLabel(/소모품명/).fill(CONS_NAME);
    await page.getByLabel(/단위/).fill("병");

    // 범위1: 분류 선택
    await page.getByRole("button", { name: "+ 범위 추가" }).click();
    // 첫 행은 기본 '분류' 모드 → category select에 E2E 분류 선택
    await page.locator("select").filter({ hasText: "분류 선택…" }).first().selectOption({ label: E2E_CATEGORY });

    // 범위2: 특정 장비 선택
    await page.getByRole("button", { name: "+ 범위 추가" }).click();
    const rows = page.locator("li", { has: page.getByRole("button", { name: "범위 행 삭제" }) });
    const secondRow = rows.nth(1);
    await secondRow.getByRole("button", { name: "특정 장비" }).click();
    await secondRow.locator("select").selectOption({ label: new RegExp(E2E_EQUIPMENT_NAME) });

    await page.getByRole("button", { name: "저장" }).click();

    // 저장 후 edit으로 redirect → 목록으로 이동해 확인
    await page.goto("/admin/consumables");
    await expect(page.getByText(CONS_NAME)).toBeVisible();
    // 적용 범위 요약(분류명 + "외 1건") 노출
    await expect(page.getByText(new RegExp(`${E2E_CATEGORY}.*외 1건`))).toBeVisible();

    // 수정 화면 진입 → 삭제
    await page.getByText(CONS_NAME).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page).toHaveURL(/\/admin\/consumables$/);
    await expect(page.getByText(CONS_NAME)).toHaveCount(0);
  });
});

// 403 — consumables.manage 없는 sales 계정 (layout equipment.manage 가드에서 차단됨)
test.describe("403 (consumables.manage 없는 사용자)", () => {
  test("sales 계정은 /admin/consumables 접근 시 '접근 권한이 없습니다'", async ({ page }) => {
    await login(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto("/admin/consumables");
    await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
  });
});
```

> 셀렉터(`getByLabel`·버튼명)는 로컬 실행에서 실제 렌더와 대조해 미세 조정한다. customers.spec.ts의 로그인 셀렉터와 동일 컨벤션을 우선 적용하고, 어긋나면 그 파일 기준으로 맞춘다.

- [ ] **Step 2: E2E 실행**

Run: `pnpm --filter web test:e2e -- consumables`
Expected: PASS (2 시나리오). 실패 시 셀렉터를 실제 DOM에 맞춰 조정(로직 아닌 셀렉터 문제).

- [ ] **Step 3: 커밋**
```bash
git add apps/web/e2e/consumables.spec.ts
git commit -m "test: 소모품 카탈로그 E2E(CRUD·scope·403) (P-C)"
```

---

## Task 12: 전체 게이트 + 스펙 자기검토

**Files:** (없음 — 검증·문서)

- [ ] **Step 1: 전체 게이트 실행**

```bash
pnpm --filter @jhtechsaas/shared test
supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
```
Expected: 전부 PASS. `as any` 0(grep으로 확인: `git grep -n "as any" -- 'apps/web/src/lib/consumables' 'apps/web/src/app/admin/consumables'` → 결과 없음).

- [ ] **Step 2: 설계 스펙 대조(누락 점검)**

스펙 §2~§5 각 항목이 구현됐는지 확인: consumables 테이블·consumable_scope(XOR·부분UNIQUE)·해석함수·consumables.manage·RLS 4정책×2·admin CRUD·scope 에디터·diff-upsert·테스트 3층. 누락 시 해당 Task로 복귀.

- [ ] **Step 3: 최종 커밋(필요 시)**

게이트 통과 후 미커밋 변경이 있으면 정리 커밋. 없으면 생략.

---

## 배포 단계(이 plan 밖 — `/ship`·`/canary`에서 수행)

- `docs/roadmap.json`의 P-C status `next`→`done`, P-D를 `next`로 변경 후 `pnpm roadmap:sync`.
- `VERSION`·`CHANGELOG.md` bump(v0.6.0.0 — M2 P-C).
- PR → 머지 → `supabase db push`(원격 DB에 마이그레이션 5,6,7 적용) → 프로덕션 200 검증.
- canary: `/admin/consumables` 실제 200·CRUD 동작 확인.

---

## 자기검토 결과(작성자 점검)

- **스펙 커버리지:** §2.1 consumables(T2)·§2.2 scope(T3)·§2.3 해석함수(T4)·§3 권한(T1·guard T7)·§4 admin UX(T9·T10)·§5 테스트 3층(T1 순수·T2~4 db·T5~6 순수·T11 E2E) — 전부 매핑됨. Out of scope(P-E)는 미포함(의도대로).
- **Placeholder:** 없음. 모든 코드 블록은 실제 구현 내용.
- **타입 일관성:** `ConsumableFormValues`·`ConsumableScopeRow`(schema) → scope-diff·actions·form 전반 동일 사용. `ConsumableListRow`(queries) → table 동일. `consumables_for_equipment(uuid)` 시그니처 db-test·migration 일치.
- **주의:** Task 5 scope-diff 테스트는 Task 6 schema 의존 → 두 태스크 연속 실행(Step 4 통과 시점 Task 6 이후). E2E 셀렉터는 로컬 DOM 대조로 미조정 필요(로직 아님).
