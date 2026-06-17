# 장비출고의뢰서 Phase 1 — DB 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** release_orders 테이블·출고번호 채번·RLS·발행본 불변·신규 권한·PDF 버킷을 만들고 db-test로 고정.

**Architecture:** 의뢰 1:1(`UNIQUE(application_id)`). 핵심 컬럼 + details jsonb. seq_no/created_at은 BEFORE 트리거로 서버 강제. 발행본(issued)은 pdf_url 외 동결. 권한 `release_orders.write`.

**Tech Stack:** Supabase(Postgres/RLS), pg(db-tests).

## Global Constraints
- 마이그 한 의도 + 롤백(`supabase/rollback/`). seq_no 형식 `REL-YYYYMMDD-NNNNN`(KST). `as any` 금지.
- 게이트: `@jhtechsaas/db-tests test:rls` + 클린 reset+seed.

---

### Task 1: 권한 레지스트리에 release_orders.write 추가

**Files:**
- Modify: `packages/shared/src/permissions.ts` (registry + SALES_PRESET)
- Modify: `packages/shared/src/permissions.test.ts` (단언 갱신)

- [ ] **Step 1: 테스트 갱신(RED)** — permissions.test.ts의 SALES_PRESET 기대 배열에 `"release_orders.write"` 추가, registry 키 존재 단언 추가(기존 패턴 따름).

- [ ] **Step 2: 실행 → 실패(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && pnpm --filter @jhtechsaas/shared exec vitest run src/permissions.test.ts`
Expected: FAIL.

- [ ] **Step 3: registry + preset에 추가(GREEN)** — permissions.ts의 PERMISSIONS 배열(기존 `email.send` 등 옆)에 `{ key: "release_orders.write", label: "출고의뢰서 작성", group: ... }`(기존 항목 형식대로), SALES_PRESET 배열에 `"release_orders.write"` 추가.

- [ ] **Step 4: 통과(GREEN)**

Run: `pnpm --filter @jhtechsaas/shared exec vitest run src/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/permissions.ts packages/shared/src/permissions.test.ts
git commit -m "feat: release_orders.write 권한(registry+영업프리셋)"
```

---

### Task 2: DB 마이그레이션 — 테이블·채번·RLS·불변·버킷

**Files:**
- Create: `supabase/migrations/20260617150000_release_orders.sql`
- Create: `supabase/rollback/20260617150000_release_orders_down.sql`
- Create: `packages/db-tests/src/release_orders.test.ts`

- [ ] **Step 1: db-test 작성(RED)** — `packages/db-tests/src/release_orders.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seedApp(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
  const a = await c.query("insert into public.applications (company, email) values ('애드넷','c@x.com') returning id");
  return a.rows[0].id as string;
}

describe("release_orders — 채번·1:1·RLS·불변", () => {
  test("write 권한+배정자는 INSERT, seq_no 자동 채번(REL-)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asPostgres(c);
      await c.query("update public.applications set assignee_id=$1 where id=$2", [UID.sales1, appId]);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','애드넷') returning seq_no, status",
        [appId],
      );
      expect(r.rows[0].seq_no).toMatch(/^REL-\d{8}-\d{5}$/);
      expect(r.rows[0].status).toBe("draft");
    });
  });

  test("권한 없으면 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asUser(c, UID.sales2); // 권한 없음
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("의뢰당 1건만(UNIQUE application_id)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      await c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]);
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'cutter','y')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("발행본(issued)은 device_kind 동결(불변 트리거)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company, status) values ($1,'printer','x','issued') returning id",
        [appId],
      );
      const id = r.rows[0].id as string;
      // pdf_url은 허용
      const okPdf = await c.query("update public.release_orders set pdf_url='p.pdf' where id=$1 returning id", [id]);
      expect(okPdf.rowCount).toBe(1);
      // device_kind 변경은 거부
      await expect(
        c.query("update public.release_orders set device_kind='cutter' where id=$1", [id]),
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: 실행 → 실패(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests exec vitest run src/release_orders.test.ts`
Expected: FAIL(테이블 없음).

- [ ] **Step 3: 마이그레이션 작성(GREEN)** — `supabase/migrations/20260617150000_release_orders.sql`

```sql
-- 장비출고의뢰서 — 의뢰 1:1. 핵심 컬럼 + details jsonb. seq_no/created_at 트리거 강제, 발행본 불변.
create table public.release_orders (
  id uuid primary key default gen_random_uuid(),
  seq_no text not null,
  application_id uuid not null unique references public.applications (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  device_kind text not null check (device_kind in ('printer','cutter')),
  status text not null default 'draft' check (status in ('draft','issued')),
  company text,
  contact_phone text,
  install_address text,
  install_at timestamptz,
  device_name text,
  details jsonb not null default '{}',
  pdf_url text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  issued_at timestamptz
);
create index on public.release_orders (application_id);

-- 출고번호 전역 시퀀스 + KST 일자 채번(견적/의뢰 패턴 재사용).
create sequence if not exists public.release_order_seq;

create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
    || '-' || lpad(nextval('public.release_order_seq')::text, 5, '0');
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;
create trigger release_orders_bi before insert on public.release_orders
  for each row execute function public.release_orders_before_insert();

-- 발행본 불변 — issued 행은 pdf_url·issued_at 외 동결(서버/워커도 우회 불가).
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;           -- 채번 불변
  new.created_at := old.created_at;   -- 생성시각 불변
  if old.status = 'issued' then
    -- 발행본은 pdf_url·issued_at만 변경 허용
    new.application_id := old.application_id;
    new.quote_id := old.quote_id;
    new.device_kind := old.device_kind;
    new.company := old.company;
    new.contact_phone := old.contact_phone;
    new.install_address := old.install_address;
    new.install_at := old.install_at;
    new.device_name := old.device_name;
    new.details := old.details;
    new.created_by := old.created_by;
    if new.status <> 'issued' then
      raise exception '발행된 출고의뢰서는 수정할 수 없습니다';
    end if;
  end if;
  return new;
end; $$;
create trigger release_orders_bu before update on public.release_orders
  for each row execute function public.release_orders_before_update();

alter table public.release_orders enable row level security;

-- SELECT: 배정 본인 또는 view_all 또는 release_orders.write.
create policy release_orders_select on public.release_orders
  for select to authenticated using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'release_orders.write'))
    or exists (
      select 1 from public.applications a
      where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
    )
  );

-- INSERT/UPDATE: release_orders.write + 행 스코프(배정 본인 또는 view_all).
create policy release_orders_insert on public.release_orders
  for insert to authenticated with check (
    (select public.has_permission((select auth.uid()), 'release_orders.write'))
    and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or exists (
        select 1 from public.applications a
        where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
      )
    )
  );
create policy release_orders_update on public.release_orders
  for update to authenticated using (
    (select public.has_permission((select auth.uid()), 'release_orders.write'))
    and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or exists (
        select 1 from public.applications a
        where a.id = release_orders.application_id and a.assignee_id = (select auth.uid())
      )
    )
  );
create policy release_orders_delete on public.release_orders
  for delete to authenticated using (
    (select public.has_permission((select auth.uid()), 'users.manage'))
  );

-- 출고의뢰서 PDF 버킷(비공개, 워커 service_role 쓰기·권한자 서명URL).
insert into storage.buckets (id, name, public) values ('release-orders','release-orders', false)
  on conflict (id) do nothing;
create policy release_orders_pdf_read on storage.objects
  for select to authenticated using (
    bucket_id = 'release-orders'
    and ((select public.has_permission((select auth.uid()), 'release_orders.write'))
         or (select public.has_permission((select auth.uid()), 'applications.view_all')))
  );
```

- [ ] **Step 4: 롤백 작성** — `supabase/rollback/20260617150000_release_orders_down.sql`

```sql
drop policy if exists release_orders_pdf_read on storage.objects;
delete from storage.buckets where id = 'release-orders';
drop table if exists public.release_orders cascade;
drop function if exists public.release_orders_before_insert() cascade;
drop function if exists public.release_orders_before_update() cascade;
drop sequence if exists public.release_order_seq;
```

- [ ] **Step 5: 리셋 + db-test → 통과(GREEN)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests exec vitest run src/release_orders.test.ts`
Expected: 전체 PASS.

- [ ] **Step 6: 전체 db-test 회귀(클린)**

Run: `pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: release_orders PASS, 기존 PASS(demo_reservations 동시성 플레이키 제외).

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/20260617150000_release_orders.sql supabase/rollback/20260617150000_release_orders_down.sql packages/db-tests/src/release_orders.test.ts
git commit -m "feat: release_orders 테이블·채번·RLS·불변·PDF 버킷"
```

---

### Task 3: PR + 배포

- [ ] PR → 머지 → `supabase db push`(원격) → 프로덕션 200.

## Self-Review
- 스펙 §1(테이블)·§6(권한·버킷·불변)=Task1·2. db-test가 채번·1:1·권한·불변 고정.
- 타입 일관: `release_orders.write`(registry·preset·RLS), seq_no `REL-` 형식.
- ⚠️ 실행 시 확인: permissions.ts의 PERMISSIONS 항목 형식(group 필드 등), has_permission super 동작(admin 자동통과는 기존 보장).
