# 장비 분류 체계(taxonomy) + 소모품 범위 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `equipment.category`(자유텍스트)를 관리형 2단계 분류 체계(`equipment_category`)로 전환하고, 소모품 적용 범위를 분류 노드(대분류=공통/소분류/특정장비) 기반으로 개편한다. 현 P-C 브랜치에 함께 포함해 1회 ship.

**Architecture:** self-ref 2단계 `equipment_category` 테이블 신설 → 라이브 `equipment.category` 텍스트를 대분류 노드로 보존 마이그레이션 후 `category_id` FK로 전환(공개뷰는 조인해 분류명 유지) → 소모품 `consumable_scope.category` 텍스트를 `category_id` FK로 재작성 → 해석 함수가 대분류 scope로 하위 소분류 장비를 커버. 읽기용 `category`(이름)는 타입·뷰·공개카탈로그·admin테이블에 그대로 두고, 쓰기/소스만 `category_id`로 전환해 파급 최소화.

**Tech Stack:** Supabase Postgres(마이그레이션·plpgsql·RLS·뷰) · Next.js 16 App Router · react-hook-form + zod · Vitest · `@jhtechsaas/db-tests`(pg set role RLS) · Playwright.

**선행 컨텍스트(반드시 읽기):**
- 설계 스펙: `docs/superpowers/specs/2026-06-02-equipment-category-taxonomy-design.md`
- 미러 원본: `supabase/migrations/20260602100002_company_equipment.sql`(트리거·RLS), P-C `apps/web/src/lib/consumables/*` 및 `apps/web/src/app/admin/consumables/*`, `apps/web/src/app/admin/equipment/*`(form·actions·edit), `apps/web/src/lib/equipment/*`, `packages/db-tests/src/company_equipment.test.ts`.
- 규칙: 코드 주석 한국어 · 커밋 prefix · `as any` 금지 · 컴포넌트 비즈니스 로직 금지(lib에) · 자식행 id 보존 diff-upsert · 롤백은 `supabase/rollback/`(단수) · db-tests 전 `supabase db reset`.

**게이트(머지 전):** `pnpm --filter @jhtechsaas/shared test` · `web test` · `@jhtechsaas/db-tests test:rls`(직전 `supabase db reset`) · `web typecheck` · `lint` · `build` · `web test:e2e` · `as any` 0.

**마이그레이션 번호 계획** (현 브랜치 미배포 — 재배치):
- `20260602100005_consumables.sql` — 유지(변경 없음).
- 기존 `20260602100006_consumable_scope.sql` / `20260602100007_consumables_for_equipment.sql` 및 두 롤백 → **삭제**(아래 새 번호로 재작성).
- 신규: `100006_equipment_category` · `100007_equipment_category_migrate` · `100008_consumable_scope`(FK판) · `100009_consumables_for_equipment`(FK판).

---

## File Structure

**마이그레이션/롤백 (`supabase/migrations/`, `supabase/rollback/`)**
- 신규 `20260602100006_equipment_category.sql` (+ `_down`)
- 신규 `20260602100007_equipment_category_migrate.sql` (+ `_down`)
- 재작성 `20260602100008_consumable_scope.sql` (구 100006 대체, + `_down`)
- 재작성 `20260602100009_consumables_for_equipment.sql` (구 100007 대체, + `_down`)

**shared (`packages/shared/src/`)**
- `types.ts` — `Equipment.category` → `category_id` 추가(+ `category` 이름은 유지). `EquipmentPublic` 불변.

**web lib (`apps/web/src/lib/`)**
- 신규 `equipment/category-tree.ts` — 트리/드롭다운 옵션 순수 빌더 (+ test)
- `equipment/schema.ts` — `category` → `category_id`
- `equipment/queries.ts` — `listEquipment` 분류명 조인; 신규 `listCategoryTree`
- 신규 `categories/actions.ts` — 분류 CRUD server actions
- `consumables/schema.ts` · `scope-diff.ts` · `queries.ts` · `actions.ts` — `category` → `category_id`

**web app (`apps/web/src/app/admin/`)**
- 신규 `categories/page.tsx` · `categories/_components/CategoryTree.tsx`
- `equipment/_components/EquipmentForm.tsx` · `equipment/actions.ts` · `equipment/new/page.tsx` · `equipment/[id]/edit/page.tsx` — 분류 드롭다운
- `consumables/_components/ConsumableScopeEditor.tsx` · `new/page.tsx` · `[id]/edit/page.tsx` — taxonomy 드롭다운
- `admin/layout.tsx` — nav "분류" 링크

**db-tests / e2e**
- 신규 `equipment_category.test.ts` · `equipment_category_migrate.test.ts`
- 재작성 `consumable_scope.test.ts` · `consumables_for_equipment.test.ts`
- 신규 `apps/web/e2e/categories.spec.ts`; 갱신 `consumables.spec.ts`

---

# PART A — 장비 분류 체계

## Task A1: shared 타입 — equipment.category_id

**Files:** Modify `packages/shared/src/types.ts`

- [ ] **Step 1: 타입 수정** — `Equipment` 인터페이스에서 `category: string | null` 줄을 아래 2줄로 교체:
```ts
  category_id: string | null;   // 분류 노드 FK (소스)
  category: string | null;      // 분류명(조인 결과, listEquipment가 채움). 표시 전용.
```
`EquipmentPublic`은 그대로(`category: string | null` = 공개뷰가 조인해 노출하는 이름).

- [ ] **Step 2: 빌드 확인**
Run: `pnpm --filter @jhtechsaas/shared build`
Expected: 성공(타입만 변경). 이 시점 web typecheck는 후속 Task에서 맞춤.

- [ ] **Step 3: 커밋**
```bash
git add packages/shared/src/types.ts
git commit -m "feat: Equipment 타입에 category_id 추가(분류체계)"
```

---

## Task A2: `equipment_category` 테이블 마이그레이션

**Files:**
- Delete: `supabase/migrations/20260602100006_consumable_scope.sql`, `supabase/migrations/20260602100007_consumables_for_equipment.sql`, `supabase/rollback/20260602100006_consumable_scope_down.sql`, `supabase/rollback/20260602100007_consumables_for_equipment_down.sql`
- Create: `supabase/migrations/20260602100006_equipment_category.sql` (+ rollback)
- Test: `packages/db-tests/src/equipment_category.test.ts`

> 구 100006/100007은 PART B에서 100008/100009로 FK판 재작성하므로 먼저 삭제(이 Task에서 git rm). 그 사이 db reset은 PART B 완료 전까지 consumable_scope/resolution 부재 상태 — PART B의 db-tests(구 파일도 삭제됨)와 함께 정합. **PART A db reset 시 consumable_scope 미존재**이므로, consumable_scope/consumables_for_equipment 테스트 파일도 이 Task에서 임시로 건너뛸 수 있게 PART B에서 재작성 전까지 비활성(파일 삭제는 PART B Task에서). → 안전하게: 이 Task에서 구 마이그레이션 2개+롤백 2개 삭제 **및** 구 db-tests `consumable_scope.test.ts`·`consumables_for_equipment.test.ts`를 PART B용으로 재작성하기 전까지 `.skip` 처리하지 말고, PART B Task B1/B2 직전까지 두되 db reset이 깨지지 않도록 PART A의 db-tests 실행은 `-- equipment_category`로 파일 지정 실행한다.

- [ ] **Step 1: 구 마이그레이션 삭제**
```bash
git rm supabase/migrations/20260602100006_consumable_scope.sql supabase/migrations/20260602100007_consumables_for_equipment.sql supabase/rollback/20260602100006_consumable_scope_down.sql supabase/rollback/20260602100007_consumables_for_equipment_down.sql
```

- [ ] **Step 2: 실패 테스트 작성** — `packages/db-tests/src/equipment_category.test.ts`
```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// admin=equipment.manage 보유, sales1=무권한
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cat-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cat-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
}

describe("equipment_category — 2단계 taxonomy RLS", () => {
  test("대분류·소분류 생성 성공(권한자)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      expect(p.rowCount).toBe(1);
      const child = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      expect(child.rowCount).toBe(1);
    });
  });
  test("3단계(손자) → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      const ch = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'손자')", [ch.rows[0].id])).rejects.toThrow();
    });
  });
  test("대분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await expect(c.query("insert into public.equipment_category (name) values ('프린터')", [])).rejects.toThrow();
    });
  });
  test("같은 부모 아래 소분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / 로그인 SELECT 허용 / anon 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.equipment_category (name) values ('금지')", [])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBeGreaterThan(0);
      await asAnon(c);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBe(0);
    });
  });
  test("참조 있는 노드 삭제 차단(restrict): 소분류가 있으면 대분류 삭제 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("delete from public.equipment_category where id=$1", [p.rows[0].id])).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 3: 실패 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment_category.test.ts`
Expected: FAIL — `relation "public.equipment_category" does not exist`. (구 consumable_scope/resolution 테스트는 PART B에서 재작성 — 지금은 파일 지정 실행으로 격리)

- [ ] **Step 4: 마이그레이션 작성** — `supabase/migrations/20260602100006_equipment_category.sql`
```sql
-- M2 — equipment_category(장비 분류 2단계). 대분류(parent_id null)/소분류(parent_id 있음).
-- 손자 금지(2단계 강제) 트리거. 쓰기=equipment.manage, 읽기=authenticated.
create table public.equipment_category (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.equipment_category (id) on delete restrict,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_category_name_len check (char_length(name) <= 100)
);
-- 대분류 동명 금지 / 같은 부모 아래 소분류 동명 금지 (부분 UNIQUE)
create unique index equipment_category_uniq_top on public.equipment_category (name) where parent_id is null;
create unique index equipment_category_uniq_child on public.equipment_category (parent_id, name) where parent_id is not null;
create index equipment_category_parent_idx on public.equipment_category (parent_id);
create index equipment_category_sort_idx on public.equipment_category (sort_order);

-- 서버통제값 + 2단계 강제: parent로 지정된 노드는 자신이 대분류(parent_id null)여야.
create or replace function public.equipment_category_enforce()
returns trigger language plpgsql set search_path = '' as $$
declare parent_parent uuid;
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception '자기 자신을 부모로 지정할 수 없습니다'; end if;
    select ec.parent_id into parent_parent from public.equipment_category ec where ec.id = new.parent_id;
    if parent_parent is not null then
      raise exception '분류는 2단계까지만 허용됩니다(손자 금지)';
    end if;
  end if;
  return new;
end;
$$;
create trigger equipment_category_enforce_trg
  before insert or update on public.equipment_category
  for each row execute function public.equipment_category_enforce();

alter table public.equipment_category enable row level security;
create policy equipment_category_select on public.equipment_category
  for select to authenticated using (true);
create policy equipment_category_insert on public.equipment_category
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_category_update on public.equipment_category
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_category_delete on public.equipment_category
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));
```
롤백 — `supabase/rollback/20260602100006_equipment_category_down.sql`:
```sql
drop trigger if exists equipment_category_enforce_trg on public.equipment_category;
drop function if exists public.equipment_category_enforce();
drop table if exists public.equipment_category cascade;
```

- [ ] **Step 5: 통과 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment_category.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: 커밋**
```bash
git add supabase/migrations/20260602100006_equipment_category.sql supabase/rollback/20260602100006_equipment_category_down.sql packages/db-tests/src/equipment_category.test.ts
git add -u supabase/migrations supabase/rollback   # 구 100006/100007 삭제 스테이징
git commit -m "feat: equipment_category 2단계 분류 테이블 + RLS (구 P-C scope 마이그레이션 제거)"
```

---

## Task A3: equipment → category_id 전환 마이그레이션 (라이브 ALTER + 데이터 보존 + 공개뷰)

**Files:**
- Create: `supabase/migrations/20260602100007_equipment_category_migrate.sql` (+ rollback)
- Test: `packages/db-tests/src/equipment_category_migrate.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/db-tests/src/equipment_category_migrate.test.ts`
```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("equipment category_id 전환 마이그레이션", () => {
  test("equipment.category_id 컬럼 존재, category 컬럼 제거됨", async () => {
    await asPostgres(c);
    const cols = await c.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='equipment' and column_name in ('category','category_id')",
    );
    const names = cols.rows.map((r: { column_name: string }) => r.column_name);
    expect(names).toContain("category_id");
    expect(names).not.toContain("category");
  });
  test("equipment.category_id → equipment_category FK", async () => {
    await asPostgres(c);
    const fk = await c.query(`
      select 1 from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
      where tc.table_name='equipment' and tc.constraint_type='FOREIGN KEY' and ccu.table_name='equipment_category'`);
    expect(fk.rowCount).toBeGreaterThan(0);
  });
  test("equipment_public 뷰가 category(분류명)를 노출", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const cat = await c.query("insert into public.equipment_category (name) values ('마이그테스트분류') returning id", []);
      await c.query("insert into public.equipment (name,category_id,base_price,status) values ('뷰장비',$1,1000,'active')", [cat.rows[0].id]);
      const v = await c.query("select category from public.equipment_public where name='뷰장비'");
      expect(v.rows[0].category).toBe("마이그테스트분류");
    });
  });
});
```

- [ ] **Step 2: 실패 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment_category_migrate.test.ts`
Expected: FAIL — `category_id` 미존재 / 뷰에 category 조인 없음.

- [ ] **Step 3: 마이그레이션 작성** — `supabase/migrations/20260602100007_equipment_category_migrate.sql`
```sql
-- M2 — equipment.category(자유텍스트) → category_id(equipment_category FK) 전환.
-- 기존 distinct category 텍스트를 대분류 노드로 보존 생성 후 매핑. 구조 정리는 admin.
-- 공개뷰는 분류명 조인으로 category(이름) 노출 유지(anon 카탈로그 호환).

alter table public.equipment add column category_id uuid references public.equipment_category (id) on delete restrict;
create index equipment_category_id_idx on public.equipment (category_id);

-- 1) 기존 distinct non-null category → 대분류 노드 보존 생성(중복 안전)
insert into public.equipment_category (name)
select distinct btrim(category) from public.equipment
where nullif(btrim(category), '') is not null
on conflict do nothing;

-- 2) equipment.category_id 매핑(대분류 노드와 이름 일치)
update public.equipment e
set category_id = ec.id
from public.equipment_category ec
where ec.parent_id is null and ec.name = btrim(e.category)
  and nullif(btrim(e.category), '') is not null;

-- 3) 공개뷰 재생성: category 텍스트 컬럼 의존 제거 → 조인 분류명 노출
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select e.id, e.name, e.model, ec.name as category, e.photos, e.highlights, e.specs, e.youtube_urls, e.created_at
  from public.equipment e
  left join public.equipment_category ec on ec.id = e.category_id
  where e.status = 'active';
grant select on public.equipment_public to anon, authenticated;

-- 4) 원본 category 텍스트 컬럼 제거
alter table public.equipment drop column category;
```
롤백 — `supabase/rollback/20260602100007_equipment_category_migrate_down.sql`:
```sql
-- 주의: category 텍스트 원복은 category_id→이름 역매핑으로 best-effort.
alter table public.equipment add column category text;
update public.equipment e set category = ec.name
  from public.equipment_category ec where ec.id = e.category_id;
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, highlights, specs, youtube_urls, created_at
  from public.equipment where status = 'active';
grant select on public.equipment_public to anon, authenticated;
drop index if exists public.equipment_category_id_idx;
alter table public.equipment drop column category_id;
```

- [ ] **Step 4: 통과 확인 + 공개뷰 회귀**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment_category_migrate.test.ts equipment.test.ts`
Expected: PASS. (equipment.test.ts가 category 텍스트에 의존하면 Task A7에서 갱신 — 실패 시 A7 먼저 처리)

- [ ] **Step 5: 커밋**
```bash
git add supabase/migrations/20260602100007_equipment_category_migrate.sql supabase/rollback/20260602100007_equipment_category_migrate_down.sql packages/db-tests/src/equipment_category_migrate.test.ts
git commit -m "feat: equipment.category → category_id 전환 + 공개뷰 조인 (데이터 보존)"
```

---

## Task A4: 분류 트리 순수 빌더 + lib

**Files:**
- Create: `apps/web/src/lib/equipment/category-tree.ts` (+ `category-tree.test.ts`)
- Modify: `apps/web/src/lib/equipment/queries.ts` (listEquipment 조인 + listCategoryTree)

- [ ] **Step 1: 실패 테스트** — `apps/web/src/lib/equipment/category-tree.test.ts`
```ts
import { describe, expect, test } from "vitest";
import { buildTree, equipmentSelectableOptions, scopeSelectableOptions, type CategoryNode } from "./category-tree";

const NODES: CategoryNode[] = [
  { id: "p1", parent_id: null, name: "프린터", sort_order: 0 },
  { id: "u1", parent_id: "p1", name: "UV프린터", sort_order: 0 },
  { id: "s1", parent_id: "p1", name: "솔벤트프린터", sort_order: 1 },
  { id: "c1", parent_id: null, name: "커팅기", sort_order: 1 },
];

describe("buildTree", () => {
  test("대분류별 children 묶음", () => {
    const tree = buildTree(NODES);
    expect(tree.map((t) => t.name)).toEqual(["프린터", "커팅기"]);
    expect(tree[0].children.map((c) => c.name)).toEqual(["UV프린터", "솔벤트프린터"]);
    expect(tree[1].children).toEqual([]);
  });
});

describe("equipmentSelectableOptions — 장비 부착(자식있는 대분류 비선택)", () => {
  test("소분류 + 자식없는 대분류만 selectable, 자식있는 대분류는 그룹헤더", () => {
    const opts = equipmentSelectableOptions(NODES);
    // 그룹: 프린터(children 선택) / 커팅기(자체 선택)
    expect(opts).toEqual([
      { group: "프린터", options: [{ id: "u1", name: "UV프린터" }, { id: "s1", name: "솔벤트프린터" }] },
      { group: null, options: [{ id: "c1", name: "커팅기" }] },
    ]);
  });
});

describe("scopeSelectableOptions — 소모품 범위(대분류=공통도 선택)", () => {
  test("대분류(공통)·소분류 모두 selectable", () => {
    const opts = scopeSelectableOptions(NODES);
    expect(opts).toEqual([
      { group: "프린터", options: [{ id: "p1", name: "프린터 공통" }, { id: "u1", name: "UV프린터" }, { id: "s1", name: "솔벤트프린터" }] },
      { group: null, options: [{ id: "c1", name: "커팅기 공통" }] },
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인**
Run: `pnpm --filter web test -- category-tree`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** — `apps/web/src/lib/equipment/category-tree.ts`
```ts
// 분류 트리 순수 로직 — 사이드이펙트 없음. 드롭다운 옵션 구성에 사용.
export interface CategoryNode {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
}
export interface CategoryTreeNode extends CategoryNode {
  children: CategoryNode[];
}
export interface OptGroup {
  group: string | null; // 대분류 헤더(자식있는 대분류) / null = 그룹없는 단독
  options: { id: string; name: string }[];
}

const bySort = (a: CategoryNode, b: CategoryNode) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

// 대분류(parent_id null)별로 children 묶은 트리. 대분류·children 각각 정렬.
export function buildTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const tops = nodes.filter((n) => n.parent_id === null).sort(bySort);
  return tops.map((t) => ({
    ...t,
    children: nodes.filter((n) => n.parent_id === t.id).sort(bySort),
  }));
}

// 장비 부착용: 자식 있는 대분류는 그룹헤더(비선택), 자식 = 옵션. 자식 없는 대분류 = 단독 옵션.
export function equipmentSelectableOptions(nodes: CategoryNode[]): OptGroup[] {
  const tree = buildTree(nodes);
  const groups: OptGroup[] = [];
  const standalone: { id: string; name: string }[] = [];
  for (const t of tree) {
    if (t.children.length > 0) {
      groups.push({ group: t.name, options: t.children.map((c) => ({ id: c.id, name: c.name })) });
    } else {
      standalone.push({ id: t.id, name: t.name });
    }
  }
  if (standalone.length) groups.push({ group: null, options: standalone });
  return groups;
}

// 소모품 범위용: 대분류(공통)도 선택 가능. 자식있는 대분류 = "X 공통" + 그 자식들. 자식없는 대분류 = "X 공통" 단독.
export function scopeSelectableOptions(nodes: CategoryNode[]): OptGroup[] {
  const tree = buildTree(nodes);
  const groups: OptGroup[] = [];
  const standalone: { id: string; name: string }[] = [];
  for (const t of tree) {
    if (t.children.length > 0) {
      groups.push({
        group: t.name,
        options: [{ id: t.id, name: `${t.name} 공통` }, ...t.children.map((c) => ({ id: c.id, name: c.name }))],
      });
    } else {
      standalone.push({ id: t.id, name: `${t.name} 공통` });
    }
  }
  if (standalone.length) groups.push({ group: null, options: standalone });
  return groups;
}
```

- [ ] **Step 4: queries 수정** — `apps/web/src/lib/equipment/queries.ts`
`listEquipment`의 select를 분류명 조인으로 바꾸고, `listCategoryTree` 추가. 파일을 아래로 교체:
```ts
import "server-only";
import type { Equipment } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CategoryNode } from "@/lib/equipment/category-tree";

// 장비 전량(최신순). 분류명(category)은 equipment_category 조인으로 채움.
export async function listEquipment(): Promise<Equipment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("*, equipment_category:category_id(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.equipment_category as { name?: string } | null;
    return {
      ...row,
      category_id: (row.category_id as string | null) ?? null,
      category: cat?.name ?? null,
      specs: parseSpecs(row.specs),
    };
  }) as unknown as Equipment[];
}

// 분류 전체 노드(대/소분류). 트리·드롭다운 빌더에 전달.
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_category")
    .select("id,parent_id,name,sort_order")
    .order("sort_order");
  if (error) { console.error("[equipment.categoryTree]", error); return []; }
  return (data ?? []) as CategoryNode[];
}
```

- [ ] **Step 5: 통과 + typecheck**
Run: `pnpm --filter web test -- category-tree && pnpm --filter web typecheck`
Expected: category-tree PASS. typecheck는 equipment 폼/actions 미수정이라 일부 에러 가능 → A6에서 해소(이 단계는 category-tree 테스트 PASS만 확인, typecheck 에러는 A6 후 재확인).

- [ ] **Step 6: 커밋**
```bash
git add apps/web/src/lib/equipment/category-tree.ts apps/web/src/lib/equipment/category-tree.test.ts apps/web/src/lib/equipment/queries.ts
git commit -m "feat: 분류 트리 빌더 + listEquipment 분류명 조인·listCategoryTree (A)"
```

---

## Task A5: 분류 관리 actions + `/admin/categories` UI

**Files:**
- Create: `apps/web/src/lib/categories/actions.ts`
- Create: `apps/web/src/app/admin/categories/page.tsx`, `_components/CategoryTree.tsx`, `loading.tsx`, `error.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx` (nav "분류")

- [ ] **Step 1: actions** — `apps/web/src/lib/categories/actions.ts`
```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";

export type CategoryActionResult = { error: string } | null;

const nameSchema = z.string().trim().min(1, "이름을 입력하세요").max(100, "100자 이내");

// 대분류 또는 소분류 추가. parentId 없으면 대분류, 있으면 소분류.
export async function createCategory(name: string, parentId: string | null): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parentId !== null && !z.string().uuid().safeParse(parentId).success) return { error: "잘못된 상위 분류입니다." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment_category").insert({ name: parsed.data, parent_id: parentId });
  if (error) {
    if (error.code === "23505") return { error: "이미 같은 이름의 분류가 있습니다." };
    // 2단계 초과 등 트리거 예외
    console.error("[categories.create]", error);
    return { error: "분류를 추가하지 못했습니다." };
  }
  revalidatePath("/admin/categories");
  return null;
}

// 이름 변경.
export async function renameCategory(id: string, name: string): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("equipment_category").update({ name: parsed.data }).eq("id", id).select("id");
  if (error) {
    if (error.code === "23505") return { error: "이미 같은 이름의 분류가 있습니다." };
    console.error("[categories.rename]", error);
    return { error: "이름을 변경하지 못했습니다." };
  }
  if (!data || data.length === 0) return { error: "없는 분류입니다." };
  revalidatePath("/admin/categories");
  return null;
}

// 삭제. 참조(자식·장비·소모품 scope) 있으면 FK restrict로 거부 → 안내 메시지.
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.string().uuid().safeParse(id).success) return { error: "잘못된 요청입니다." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("equipment_category").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") return { error: "이 분류를 쓰는 하위분류·장비·소모품이 있어 삭제할 수 없습니다. 먼저 재배정하세요." };
    console.error("[categories.delete]", error);
    return { error: "삭제하지 못했습니다." };
  }
  if (!data || data.length === 0) return { error: "없는 분류입니다." };
  revalidatePath("/admin/categories");
  return null;
}
```

- [ ] **Step 2: 페이지** — `apps/web/src/app/admin/categories/page.tsx`
```tsx
import { requireEquipmentManage } from "@/lib/auth/guard";
import { listCategoryTree } from "@/lib/equipment/queries";
import { buildTree } from "@/lib/equipment/category-tree";
import { CategoryTree } from "./_components/CategoryTree";
import { signOut } from "@/app/login/actions";

export default async function CategoriesPage() {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">장비 관리 권한(equipment.manage)이 필요합니다.</p>
        <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
      </main>
    );
  }
  const tree = buildTree(await listCategoryTree());
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 분류</h1>
      <p className="text-small text-muted">대분류(프린터·커팅기) 아래 소분류를 둡니다. 소모품 범위·장비 등록이 이 분류를 씁니다.</p>
      <CategoryTree tree={tree} />
    </section>
  );
}
```

- [ ] **Step 3: 트리 컴포넌트** — `apps/web/src/app/admin/categories/_components/CategoryTree.tsx`
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryTreeNode } from "@/lib/equipment/category-tree";
import { createCategory, renameCategory, deleteCategory } from "@/lib/categories/actions";

export function CategoryTree({ tree }: { tree: CategoryTreeNode[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newTop, setNewTop] = useState("");

  function run(fn: () => Promise<{ error: string } | null>) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      {err ? <p className="text-small text-danger">{err}</p> : null}

      {/* 대분류 추가 */}
      <div className="flex gap-2">
        <input value={newTop} onChange={(e) => setNewTop(e.target.value)} placeholder="새 대분류명(예: 프린터)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body text-text" />
        <button type="button" disabled={pending || !newTop.trim()}
          onClick={() => { run(() => createCategory(newTop, null)); setNewTop(""); }}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60">+ 대분류</button>
      </div>

      <ul className="flex flex-col gap-3">
        {tree.map((top) => (
          <TopNode key={top.id} node={top} pending={pending} run={run} />
        ))}
      </ul>
    </div>
  );
}

function TopNode({ node, pending, run }: {
  node: CategoryTreeNode; pending: boolean;
  run: (fn: () => Promise<{ error: string } | null>) => void;
}) {
  const [child, setChild] = useState("");
  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">{node.name}</span>
        <button type="button" disabled={pending}
          onClick={() => { const n = prompt("대분류 이름 변경", node.name); if (n) run(() => renameCategory(node.id, n)); }}
          className="text-micro text-muted hover:text-text">수정</button>
        <button type="button" disabled={pending}
          onClick={() => { if (confirm(`'${node.name}' 삭제?`)) run(() => deleteCategory(node.id)); }}
          className="text-micro text-danger hover:underline">삭제</button>
      </div>
      <ul className="mt-2 flex flex-col gap-1 pl-4">
        {node.children.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-body text-text">
            <span>– {c.name}</span>
            <button type="button" disabled={pending}
              onClick={() => { const n = prompt("소분류 이름 변경", c.name); if (n) run(() => renameCategory(c.id, n)); }}
              className="text-micro text-muted hover:text-text">수정</button>
            <button type="button" disabled={pending}
              onClick={() => { if (confirm(`'${c.name}' 삭제?`)) run(() => deleteCategory(c.id)); }}
              className="text-micro text-danger hover:underline">삭제</button>
          </li>
        ))}
        <li className="flex gap-2 pt-1">
          <input value={child} onChange={(e) => setChild(e.target.value)} placeholder="새 소분류명"
            className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-small text-text" />
          <button type="button" disabled={pending || !child.trim()}
            onClick={() => { run(() => createCategory(child, node.id)); setChild(""); }}
            className="text-small font-medium text-accent hover:underline">+ 소분류</button>
        </li>
      </ul>
    </li>
  );
}
```

- [ ] **Step 4: loading/error** — `apps/web/src/app/admin/categories/loading.tsx`:
```tsx
export default function Loading() {
  return <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />;
}
```
`apps/web/src/app/admin/categories/error.tsx`:
```tsx
"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10">
      <p className="text-body text-text">분류를 불러오지 못했습니다</p>
      <button onClick={reset} className="text-small text-accent underline">다시 시도</button>
    </div>
  );
}
```

- [ ] **Step 5: nav 링크** — `apps/web/src/app/admin/layout.tsx`의 `<nav>`에서 "장비" Link 다음에 추가:
```tsx
          <Link
            href="/admin/categories"
            className="rounded-md px-3 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            분류
          </Link>
```

- [ ] **Step 6: typecheck + lint**
Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS(분류 관련). equipment 폼 미수정이면 typecheck 에러 잔존 가능 → A6 후 최종 확인.

- [ ] **Step 7: 커밋**
```bash
git add apps/web/src/lib/categories apps/web/src/app/admin/categories apps/web/src/app/admin/layout.tsx
git commit -m "feat: /admin/categories 분류 트리 CRUD + nav (A)"
```

---

## Task A6: 장비 폼 분류 드롭다운 (schema·form·actions·pages)

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts`, `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`, `apps/web/src/app/admin/equipment/actions.ts`, `apps/web/src/app/admin/equipment/new/page.tsx`, `apps/web/src/app/admin/equipment/[id]/edit/page.tsx`

- [ ] **Step 1: schema** — `apps/web/src/lib/equipment/schema.ts`에서 `category: z.string().trim().default("")` 줄을 교체:
```ts
  category_id: z.string().uuid().or(z.literal("")).default(""),
```

- [ ] **Step 2: EquipmentForm** — props에 `categories` 추가 + 분류 필드 교체.
`equipment/schema.ts`에서 import 옆에 옵션 빌더 import 추가:
```ts
import { equipmentSelectableOptions, type CategoryNode } from "@/lib/equipment/category-tree";
```
EquipmentForm props 타입에 `categories: CategoryNode[]` 추가(create·edit 양쪽). `defaultValues` create의 `category: ""` → `category_id: ""`. `<Field label="분류">` 블록(현재 input)을 드롭다운으로 교체:
```tsx
        <Field label="분류" error={errors.category_id?.message}>
          <select
            {...register("category_id")}
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          >
            <option value="">미지정</option>
            {equipmentSelectableOptions(props.categories).map((g, i) =>
              g.group === null ? (
                g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
              ) : (
                <optgroup key={`g${i}`} label={g.group}>
                  {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              ),
            )}
          </select>
        </Field>
```
> `props.categories`는 new/edit 페이지가 `listCategoryTree()`로 주입. EquipmentForm이 `props`를 안 쓰는 구조면(현재 mode 분기) props 객체를 받도록 시그니처 조정 — 기존 `EquipmentForm(props)` 형태 유지하며 `props.categories` 추가.

- [ ] **Step 3: actions** — `apps/web/src/app/admin/equipment/actions.ts`의 insert/update에서 `category: v.category || null` 2곳을 교체:
```ts
    category_id: v.category_id || null,
```

- [ ] **Step 4: new 페이지** — `apps/web/src/app/admin/equipment/new/page.tsx` 교체:
```tsx
import { requireEquipmentManage } from "@/lib/auth/guard";
import { listCategoryTree } from "@/lib/equipment/queries";
import { EquipmentForm } from "../_components/EquipmentForm";

export default async function NewEquipmentPage() {
  await requireEquipmentManage();
  const categories = await listCategoryTree();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 추가</h1>
      <EquipmentForm mode="create" categories={categories} />
    </section>
  );
}
```

- [ ] **Step 5: edit 페이지** — `apps/web/src/app/admin/equipment/[id]/edit/page.tsx`: select에서 `category` → `category_id`, initial에서 `category: data.category ?? ""` → `category_id: data.category_id ?? ""`, `listCategoryTree()` fetch 후 `<EquipmentForm ... categories={categories} />`. select 줄:
```ts
    .select("name, model, category_id, base_price, status, highlights, youtube_urls, specs, photos")
```
initial 줄:
```ts
    category_id: data.category_id ?? "",
```
페이지 상단에 `import { listCategoryTree } from "@/lib/equipment/queries";` 추가, `const categories = await listCategoryTree();`, `<EquipmentForm mode="edit" initial={initial} categories={categories} />`.

- [ ] **Step 6: typecheck + lint + build**
Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: 모두 PASS. (EquipmentForm initial 타입에 category_id 포함 확인)

- [ ] **Step 7: 커밋**
```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/app/admin/equipment
git commit -m "feat: 장비 폼 분류 드롭다운(category_id) (A)"
```

---

## Task A7: equipment db-tests 갱신 + 분류 E2E

**Files:**
- Modify: `packages/db-tests/src/equipment.test.ts`, `equipment-crud.test.ts` (category → category_id; 있으면)
- Create: `apps/web/e2e/categories.spec.ts`

- [ ] **Step 1: 기존 equipment db-tests의 category 참조 수정**
`packages/db-tests/src/equipment.test.ts`·`equipment-crud.test.ts`에서 `category` 텍스트 컬럼을 쓰는 INSERT/단언이 있으면 `category_id`(또는 제거)로 교체. (Task A3 grep 결과 현재 직접 참조 없음 — 있으면 수정, 없으면 이 Step 스킵하고 회귀만 확인.)
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment`
Expected: PASS.

- [ ] **Step 2: 분류 E2E** — `apps/web/e2e/categories.spec.ts`
```ts
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const TOP = "E2E대분류프린터";
const SUB = "E2E소분류UV";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
async function sr(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, { ...options, headers: { apikey: LOCAL_SERVICE_ROLE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(options.headers ?? {}) } });
}
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/이메일/).fill(ADMIN_EMAIL);
  await page.getByLabel(/비밀번호/).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /로그인/ }).click();
}

test.describe.serial("장비 분류 CRUD", () => {
  test.afterAll(async () => {
    await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(SUB)}`, { method: "DELETE" });
    await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent(TOP)}`, { method: "DELETE" });
  });
  test("대분류·소분류 추가", async ({ page }) => {
    await login(page);
    await page.goto("/admin/categories");
    await page.getByPlaceholder("새 대분류명(예: 프린터)").fill(TOP);
    await page.getByRole("button", { name: "+ 대분류" }).click();
    await expect(page.getByText(TOP)).toBeVisible();
    // 해당 대분류 카드의 소분류 입력
    const card = page.locator("li", { hasText: TOP });
    await card.getByPlaceholder("새 소분류명").fill(SUB);
    await card.getByRole("button", { name: "+ 소분류" }).click();
    await expect(page.getByText(`– ${SUB}`)).toBeVisible();
  });
});
```

- [ ] **Step 3: E2E 실행** — 셀렉터는 실제 DOM에 맞춰 조정.
Run: `pnpm --filter web test:e2e -- categories`
Expected: PASS.

- [ ] **Step 4: 커밋**
```bash
git add packages/db-tests/src/equipment.test.ts packages/db-tests/src/equipment-crud.test.ts apps/web/e2e/categories.spec.ts
git commit -m "test: 장비 분류 db-tests 갱신 + 분류 CRUD E2E (A)"
```

---

# PART B — 소모품 scope 개편 (category_id)

## Task B1: consumable_scope FK 재작성 마이그레이션

**Files:**
- Create: `supabase/migrations/20260602100008_consumable_scope.sql` (+ rollback)
- Rewrite: `packages/db-tests/src/consumable_scope.test.ts`

- [ ] **Step 1: 테스트 재작성** — `packages/db-tests/src/consumable_scope.test.ts` 전체를 category_id 기반으로 교체:
```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

async function seed(): Promise<{ cid: string; catId: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "scope-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "scope-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  const cat = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UV프린터A',$2,1000,'active')", [EQ, cat.rows[0].id]);
  const r = await c.query("insert into public.consumables (name) values ('UV잉크') returning id", []);
  return { cid: r.rows[0].id as string, catId: cat.rows[0].id as string };
}

describe("consumable_scope — category_id XOR equipment_id + RLS", () => {
  test("category_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2) returning id", [cid, catId]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id,equipment_id) values ($1,$2,$3)", [cid, catId, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  test("같은 소모품·분류 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId])).rejects.toThrow();
    });
  });
  test("같은 소모품·장비 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await asAnon(c);
      expect((await c.query("select id from public.consumable_scope")).rowCount).toBe(0);
    });
  });
  test("consumable 삭제 시 scope cascade", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await c.query("delete from public.consumables where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.consumable_scope where consumable_id=$1", [cid])).rowCount).toBe(0);
    });
  });
  test("사용 중 분류 삭제 차단(restrict)", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await expect(c.query("delete from public.equipment_category where id=$1", [catId])).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: 실패 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumable_scope.test.ts`
Expected: FAIL — `column "category_id" of relation "consumable_scope" does not exist` (테이블 자체 없음).

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260602100008_consumable_scope.sql`
```sql
-- M2 P-C #21 — consumable_scope(매핑). category_id XOR equipment_id = 정확히 하나.
-- category_id = equipment_category 노드(대분류=공통 / 소분류). consumable 삭제 시 cascade.
-- 분류·장비 삭제는 restrict(매핑 보호). id 보존 diff-upsert.
create table public.consumable_scope (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.consumables (id) on delete cascade,
  category_id uuid references public.equipment_category (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumable_scope_identity
    check ((category_id is not null) <> (equipment_id is not null))
);
create unique index consumable_scope_uniq_equipment
  on public.consumable_scope (consumable_id, equipment_id) where equipment_id is not null;
create unique index consumable_scope_uniq_category
  on public.consumable_scope (consumable_id, category_id) where category_id is not null;
create index consumable_scope_consumable_idx on public.consumable_scope (consumable_id);
create index consumable_scope_equipment_idx on public.consumable_scope (equipment_id);
create index consumable_scope_category_idx on public.consumable_scope (category_id);

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
create policy consumable_scope_select on public.consumable_scope for select to authenticated using (true);
create policy consumable_scope_insert on public.consumable_scope for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_update on public.consumable_scope for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_delete on public.consumable_scope for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
```
롤백 — `supabase/rollback/20260602100008_consumable_scope_down.sql`:
```sql
drop trigger if exists consumable_scope_server_fields on public.consumable_scope;
drop function if exists public.consumable_scope_enforce_server_fields();
drop table if exists public.consumable_scope cascade;
```

- [ ] **Step 4: 통과 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumable_scope.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋**
```bash
git add supabase/migrations/20260602100008_consumable_scope.sql supabase/rollback/20260602100008_consumable_scope_down.sql packages/db-tests/src/consumable_scope.test.ts
git commit -m "feat: consumable_scope category_id FK 재작성 + RLS (B)"
```

---

## Task B2: 해석 함수 재작성 (대분류 커버)

**Files:**
- Create: `supabase/migrations/20260602100009_consumables_for_equipment.sql` (+ rollback)
- Rewrite: `packages/db-tests/src/consumables_for_equipment.test.ts`

- [ ] **Step 1: 테스트 재작성** — `packages/db-tests/src/consumables_for_equipment.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ_UV = "00000000-0000-0000-0000-0000000000e1"; // UV프린터(소분류)
const EQ_SOL = "00000000-0000-0000-0000-0000000000e2"; // 솔벤트(소분류)
const EQ_CUT = "00000000-0000-0000-0000-0000000000e3"; // 커팅기(단독 대분류)

async function seed() {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cfe-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  const printer = (await c.query("insert into public.equipment_category (name) values ('프린터') returning id", [])).rows[0].id;
  const uv = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [printer])).rows[0].id;
  const sol = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'솔벤트') returning id", [printer])).rows[0].id;
  const cut = (await c.query("insert into public.equipment_category (name) values ('커팅기') returning id", [])).rows[0].id;
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UVA',$2,1,'active')", [EQ_UV, uv]);
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'SOLA',$2,1,'active')", [EQ_SOL, sol]);
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'CUTA',$2,1,'active')", [EQ_CUT, cut]);
  const ink = (await c.query("insert into public.consumables (name) values ('UV잉크') returning id", [])).rows[0].id;
  const clean = (await c.query("insert into public.consumables (name) values ('세정액') returning id", [])).rows[0].id;
  const blade = (await c.query("insert into public.consumables (name) values ('칼날') returning id", [])).rows[0].id;
  const dead = (await c.query("insert into public.consumables (name,status) values ('단종','inactive') returning id", [])).rows[0].id;
  // UV잉크 → 소분류 UV / 세정액 → 대분류 프린터(공통) / 칼날 → 대분류 커팅기 / 단종 → 대분류 프린터(inactive)
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [ink, uv]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, printer]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [blade, cut]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [dead, printer]);
  return { ink, clean, blade, dead };
}

describe("consumables_for_equipment — 대분류 커버·소분류·단독대분류·dedup·active", () => {
  test("UV프린터 장비 → UV잉크(소분류) + 세정액(대분류 프린터 공통), 단종 제외", async () => {
    await inRollbackTx(c, async () => {
      const { dead } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1) order by name", [EQ_UV]);
      expect(r.rows.map((x: { name: string }) => x.name).sort()).toEqual(["UV잉크", "세정액"].sort());
      const ids = (await c.query("select id from public.consumables_for_equipment($1)", [EQ_UV])).rows.map((x: { id: string }) => x.id);
      expect(ids).not.toContain(dead);
    });
  });
  test("솔벤트 장비 → 세정액만(대분류 프린터 공통, UV잉크는 다른 소분류라 제외)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_SOL]);
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["세정액"]);
    });
  });
  test("커팅기 장비(단독 대분류) → 칼날만", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_CUT]);
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["칼날"]);
    });
  });
  test("dedup: 소분류+대분류 양쪽 매핑돼도 1행", async () => {
    await inRollbackTx(c, async () => {
      const { clean } = await seed(); await asUser(c, UID.admin);
      // 세정액에 UV 소분류도 추가 → UV장비엔 대분류+소분류 양쪽
      const uv = (await c.query("select category_id from public.equipment where id=$1", [EQ_UV])).rows[0].category_id;
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, uv]);
      const r = await c.query("select id from public.consumables_for_equipment($1) where id=$2", [EQ_UV, clean]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("anon 호출 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      await expect(c.query("select * from public.consumables_for_equipment($1)", [EQ_UV])).rejects.toThrow(/permission denied/);
    });
  });
});
```

- [ ] **Step 2: 실패 확인**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls -- consumables_for_equipment.test.ts`
Expected: FAIL — 함수 없음.

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260602100009_consumables_for_equipment.sql`
```sql
-- M2 P-C #21 — 해석 함수: 장비에 매칭되는 active 소모품 dedup 반환.
-- scope.equipment_id 직접 OR scope.category_id = 장비분류 OR scope.category_id = 장비분류의 부모(대분류 공통).
-- 2단계 한정이라 재귀 불필요. SECURITY DEFINER + search_path='' + STABLE.
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
  join public.equipment e on e.id = p_equipment_id
  where cn.status = 'active'
    and (
      cs.equipment_id = p_equipment_id
      or cs.category_id = e.category_id
      or cs.category_id = (select ec.parent_id from public.equipment_category ec where ec.id = e.category_id)
    );
$$;
-- anon/PUBLIC 차단(P-C 함정), authenticated만 (P-E에서 anon 별도 결정).
revoke execute on function public.consumables_for_equipment(uuid) from public, anon;
grant execute on function public.consumables_for_equipment(uuid) to authenticated;
```
롤백 — `supabase/rollback/20260602100009_consumables_for_equipment_down.sql`:
```sql
drop function if exists public.consumables_for_equipment(uuid);
```

- [ ] **Step 4: 통과 + 전체 db-tests 회귀**
Run: `supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: 전체 PASS(equipment_category·migrate·scope·resolution·기존 전부).

- [ ] **Step 5: 커밋**
```bash
git add supabase/migrations/20260602100009_consumables_for_equipment.sql supabase/rollback/20260602100009_consumables_for_equipment_down.sql packages/db-tests/src/consumables_for_equipment.test.ts
git commit -m "feat: consumables_for_equipment 대분류 커버 재작성 (B)"
```

---

## Task B3: 소모품 schema·scope-diff (category_id)

**Files:** Modify `apps/web/src/lib/consumables/schema.ts`, `scope-diff.ts`, and their tests.

- [ ] **Step 1: schema 테스트 갱신** — `apps/web/src/lib/consumables/schema.test.ts`의 scope 케이스에서 `category: "UV프린터"` → `category_id: "<uuid>"`로. 교체 블록:
```ts
describe("consumableScopeRowSchema — category_id XOR equipment_id", () => {
  const base = { id: "", category_id: "", equipment_id: "" };
  const UUID = "11111111-1111-4111-a111-111111111111";
  test("category_id만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category_id: UUID }).success).toBe(true);
  });
  test("equipment_id만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, equipment_id: "22222222-2222-4222-a222-222222222222" }).success).toBe(true);
  });
  test("둘 다 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category_id: UUID, equipment_id: "22222222-2222-4222-a222-222222222222" }).success).toBe(false);
  });
  test("둘 다 없음 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse(base).success).toBe(false);
  });
});
```

- [ ] **Step 2: schema 구현** — `apps/web/src/lib/consumables/schema.ts`의 `consumableScopeRowSchema` 교체:
```ts
export const consumableScopeRowSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")),
    category_id: z.string().uuid().or(z.literal("")),
    equipment_id: z.string().uuid().or(z.literal("")),
  })
  .refine(
    (r) => (r.category_id !== "") !== (r.equipment_id !== ""),
    "분류 또는 특정 장비 중 하나만 지정하세요",
  );
```

- [ ] **Step 3: scope-diff 테스트 갱신** — `apps/web/src/lib/consumables/scope-diff.test.ts`: `category` → `category_id`. row 헬퍼 base `{ id:"", category_id:"", equipment_id:"" }`, 단언의 `category` → `category_id`. (전체 파일에서 `category:` → `category_id:` 치환, 값은 유효 uuid 또는 "")

- [ ] **Step 4: scope-diff 구현** — `apps/web/src/lib/consumables/scope-diff.ts`의 `toScopeDbRow` 교체:
```ts
export function toScopeDbRow(consumable_id: string, r: ConsumableScopeRow) {
  return {
    consumable_id,
    category_id: r.equipment_id ? null : r.category_id || null,
    equipment_id: r.equipment_id || null,
  };
}
```
(`diffScopes`는 변경 없음 — id 기반 분리 동일.)

- [ ] **Step 5: 통과**
Run: `pnpm --filter web test -- consumables`
Expected: schema + scope-diff PASS.

- [ ] **Step 6: 커밋**
```bash
git add apps/web/src/lib/consumables/schema.ts apps/web/src/lib/consumables/schema.test.ts apps/web/src/lib/consumables/scope-diff.ts apps/web/src/lib/consumables/scope-diff.test.ts
git commit -m "feat: 소모품 scope 스키마·diff category_id 전환 (B)"
```

---

## Task B4: 소모품 queries·actions (category_id + 요약)

**Files:** Modify `apps/web/src/lib/consumables/queries.ts`, `actions.ts`

- [ ] **Step 1: queries** — `listConsumables`의 임베드를 category_id 노드명 조인으로, 요약 구성 수정. select·매핑 교체:
```ts
    .select("id,name,unit,sku,status,updated_at,consumable_scope(category_id,equipment_id,equipment_category:category_id(name),equipment:equipment_id(name))")
```
매핑 내 labels 구성 교체:
```ts
    const scopes = (r.consumable_scope as Array<{ equipment_category: { name?: string } | null; equipment: { name?: string } | null }> | null) ?? [];
    const labels = scopes
      .map((s) => s.equipment_category?.name ?? s.equipment?.name ?? null)
      .filter((x): x is string => !!x);
```
(`getConsumable`은 `select("*, consumable_scope(*)")` 유지 — 이제 scope에 category_id 포함.)

- [ ] **Step 2: actions** — `apps/web/src/lib/consumables/actions.ts`는 `diffScopes`/`toScopeDbRow`가 category_id를 처리하므로 **변경 거의 없음**. `applyScopeDiff`·`consumableRow` 그대로. 확인만(컴파일).

- [ ] **Step 3: typecheck**
Run: `pnpm --filter web typecheck`
Expected: consumables 관련 PASS(에디터 미수정이면 B5에서 해소).

- [ ] **Step 4: 커밋**
```bash
git add apps/web/src/lib/consumables/queries.ts
git commit -m "feat: 소모품 목록 요약 분류명 조인(category_id) (B)"
```

---

## Task B5: scope 에디터 taxonomy 드롭다운 + 페이지 주입

**Files:** Modify `apps/web/src/app/admin/consumables/_components/ConsumableScopeEditor.tsx`, `ConsumableForm.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`

- [ ] **Step 1: 에디터** — `ConsumableScopeEditor.tsx`: `categories: string[]` prop → `categoryOptions: OptGroup[]`(scopeSelectableOptions 결과). 분류 select를 optgroup으로, 값=category_id. 분류 모드 select 교체:
```tsx
      {mode === "category" ? (
        <select {...register(`scopes.${index}.category_id`)}
          className="min-w-[180px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text">
          <option value="">분류 선택…</option>
          {categoryOptions.map((g, gi) => g.group === null
            ? g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
            : <optgroup key={`g${gi}`} label={g.group}>{g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>)}
        </select>
      ) : ( /* 장비 select 동일 */ )}
```
토글 시 `setValue(\`scopes.${index}.category_id\`, "")` / `equipment_id` 초기화. append 기본값 `{ id:"", category_id:"", equipment_id:"" }`. 초기 모드 = `equipment_id ? "equipment" : "category"`. import `import { type OptGroup } from "@/lib/equipment/category-tree";`. hidden id 유지.

- [ ] **Step 2: ConsumableForm** — `categories: string[]` prop → `categoryOptions: OptGroup[]` 전달. defaultValues scope 매핑 `category` → `category_id`. 에디터에 `categoryOptions` 전달.

- [ ] **Step 3: new/edit 페이지** — `listEquipment`로 만들던 `categories`(distinct 문자열) 제거. 대신:
```ts
import { listCategoryTree } from "@/lib/equipment/queries";
import { scopeSelectableOptions } from "@/lib/equipment/category-tree";
// ...
const categoryOptions = scopeSelectableOptions(await listCategoryTree());
```
장비 드롭다운용 `catalog`는 `listEquipment()` 유지(특정 장비 모드). `<ConsumableForm ... catalog={catalog} categoryOptions={categoryOptions} />`. edit 페이지의 scope 매핑 `category` → `category_id`.

- [ ] **Step 4: typecheck + lint + build**
Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: 모두 PASS, `as any` 0.

- [ ] **Step 5: 커밋**
```bash
git add apps/web/src/app/admin/consumables
git commit -m "feat: 소모품 scope 에디터 taxonomy 드롭다운(category_id) (B)"
```

---

## Task B6: 소모품 E2E 갱신 (taxonomy)

**Files:** Modify `apps/web/e2e/consumables.spec.ts`

- [ ] **Step 1: E2E 갱신** — 기존 시드(자유텍스트 category 장비)를 taxonomy 기반으로. service role로 대분류·소분류·장비 시드 후, 소모품 생성 시 분류 모드에서 "프린터 공통"(대분류) 선택. resetAndSeed 교체:
```ts
async function resetAndSeed() {
  await sr(`/rest/v1/consumables?name=eq.${encodeURIComponent(CONS_NAME)}`, { method: "DELETE" });
  await sr(`/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`, { method: "DELETE" });
  await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent("E2E소분류UV")}`, { method: "DELETE" });
  await sr(`/rest/v1/equipment_category?name=eq.${encodeURIComponent("E2E대분류프린터")}`, { method: "DELETE" });
  const top = await (await sr(`/rest/v1/equipment_category`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: "E2E대분류프린터" }) })).json();
  const sub = await (await sr(`/rest/v1/equipment_category`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: "E2E소분류UV", parent_id: top[0].id }) })).json();
  await sr(`/rest/v1/equipment`, { method: "POST", body: JSON.stringify({ name: E2E_EQUIPMENT_NAME, category_id: sub[0].id, base_price: 1000, status: "active" }) });
  return { topId: top[0].id, subId: sub[0].id };
}
```
시나리오에서 분류 select 옵션 라벨을 "E2E대분류프린터 공통"(대분류) 선택, 목록 요약은 "외 1건" 검증 유지. afterAll에 equipment_category 정리 추가. 셀렉터는 실제 DOM에 맞춰 조정.

- [ ] **Step 2: E2E 실행**
Run: `pnpm --filter web test:e2e -- consumables`
Expected: PASS.

- [ ] **Step 3: 커밋**
```bash
git add apps/web/e2e/consumables.spec.ts
git commit -m "test: 소모품 E2E taxonomy(대분류 공통) 갱신 (B)"
```

---

# PART C — 게이트

## Task C1: 전체 게이트 + 스펙 대조

- [ ] **Step 1: 전체 게이트**
```bash
pnpm --filter @jhtechsaas/shared test
supabase db reset && pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
```
Expected: 전부 PASS. `git grep -n "as any" -- 'apps/web/src/lib/consumables' 'apps/web/src/lib/categories' 'apps/web/src/lib/equipment/category-tree.ts' 'apps/web/src/app/admin/categories' 'apps/web/src/app/admin/consumables'` → 결과 없음.

- [ ] **Step 2: 스펙 대조** — 설계 §2~§7 각 항목이 구현됐는지 확인(equipment_category·migrate·scope FK·해석함수·분류 admin·장비 드롭다운·scope 드롭다운·테스트 3층). 누락 시 해당 Task 복귀.

- [ ] **Step 3: 정리 커밋(필요 시).**

---

## 배포 단계 (이 plan 밖 — `/ship`·`/canary`)
- `docs/roadmap.json` P-C done·다음 단계 next → `pnpm roadmap:sync`.
- VERSION·CHANGELOG bump.
- PR → 머지 → `supabase db push`(마이그레이션 100005~100009 적용 — ⚠️ equipment.category 전환 포함, 적용 전 스테이징/로컬 db reset 검증) → 프로덕션 200·`/admin/categories`·`/admin/consumables` 동작 확인.

---

## 자기검토 결과(작성자)
- **스펙 커버리지:** §2.1 equipment_category(A2)·§2.2 equipment 전환+공개뷰(A3)·§2.3 consumable_scope FK(B1)·§3 해석함수(B2)·§4.1 /admin/categories(A5)·§4.2 장비 드롭다운(A6)·§4.3 scope 드롭다운(B5)·§5 명시적(스키마 XOR)·§6 마이그번호(A2~B2)·§7 테스트(A2·A3·A7·B1·B2·B6 + 순수 A4·B3) 전부 매핑.
- **Placeholder:** Task A2 Step 설명에 절차 주의는 있으나 모든 코드 블록은 실제 구현. 구 마이그레이션 삭제·재번호 명시.
- **타입 일관성:** `CategoryNode`·`OptGroup`(category-tree) → queries·form·scope editor 일관. `category_id`(equipment schema·consumable schema·scope-diff·actions) 일관. `consumables_for_equipment(uuid)` 시그니처 불변.
- **주의(실행자):** PART A에서 consumable_scope/resolution 부재 구간 → db-tests는 `-- <파일>` 지정 실행으로 격리, 전체 `test:rls`는 B2 이후 통과. E2E 셀렉터는 로컬 DOM 대조 미세조정. equipment.category 전환은 라이브 마이그레이션 — db push 전 검증 필수.
