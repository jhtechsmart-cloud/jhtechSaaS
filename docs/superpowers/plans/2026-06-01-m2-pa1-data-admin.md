# M2 P-A1 (#19a) — 데이터 모델 + admin 입력 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적요청 v2의 데이터 토대(equipment 그룹사양·highlights·복수영상, applications 동의·equipment_id FK, privacy_policies, customer-uploads 버킷, submit RPC v2)와 운영자 입력 UI를 구축한다.

**Architecture:** Supabase 마이그레이션 5개(각 단일 의도 + rollback 별도) → shared 도메인 로직(그룹 specs·biz_no·타입) → web admin 폼 확장. RLS·서버통제값 트리거 불변 원칙 유지. 익명 제출 경로는 SECURITY DEFINER RPC. 검증은 shared=Vitest 단위, DB=db-tests(pg set role).

**Tech Stack:** Postgres(Supabase local 54322), Zod, react-hook-form, Vitest, pg, Next.js(App Router).

**Spec:** GitHub #19 (P-A1 섹션). 설계: `docs/superpowers/specs/2026-06-01-m2-customer-portal-design.md`.

**선행 확인(워커 환경):** 모든 db-test 전에 로컬 Supabase가 떠 있어야 한다. 마이그레이션 추가 후 `supabase migration up` 또는 `supabase db reset`으로 로컬 DB에 반영한 뒤 `pnpm --filter @jhtechsaas/db-tests test:rls`를 돌린다.

---

## File Structure

생성:
- `supabase/migrations/20260601170001_equipment_pa.sql` + `..._rollback.sql`
- `supabase/migrations/20260601170002_applications_pa.sql` + `..._rollback.sql`
- `supabase/migrations/20260601170003_privacy_policies.sql` + `..._rollback.sql`
- `supabase/migrations/20260601170004_customer_uploads_bucket.sql` + `..._rollback.sql`
- `supabase/migrations/20260601170005_submit_application_v2.sql` + `..._rollback.sql`
- `packages/shared/src/biz-no.ts` + `biz-no.test.ts`
- `apps/web/src/components/SpecGroupIcon.tsx`
- `apps/web/src/app/admin/equipment/_components/HighlightsEditor.tsx`
- `apps/web/src/app/admin/equipment/_components/YoutubeUrlsEditor.tsx`
- `packages/db-tests/src/privacy_policies.test.ts`
- `packages/db-tests/src/customer_uploads.test.ts`

수정:
- `packages/shared/src/specs.ts` (+ `specs.test.ts`)
- `packages/shared/src/types.ts`
- `packages/shared/src/index.ts` (biz-no export)
- `apps/web/src/lib/equipment/schema.ts` (+ `schema.test.ts`)
- `apps/web/src/app/admin/equipment/_components/SpecEditor.tsx` (그룹형 재작성)
- `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` (배선)
- `apps/web/src/lib/equipment/queries.ts` / `public-queries.ts` (신컬럼 select)
- `packages/db-tests/src/equipment.test.ts`, `submit_application.test.ts` (신컬럼·v2)

---

## Task 1: shared — 그룹 사양 스키마 + 하위호환 파서

**Files:**
- Modify: `packages/shared/src/specs.ts`
- Test: `packages/shared/src/specs.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/shared/src/specs.test.ts`에 추가/교체

```ts
import { describe, expect, test } from "vitest";
import { parseSpecs, serializeSpecs, SPEC_ICONS } from "./specs";

describe("parseSpecs (그룹형 + 하위호환)", () => {
  test("그룹형 입력은 그대로 정규화한다", () => {
    const raw = [{ group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] },
    ]);
  });

  test("평면 [{label,value}] 레거시는 단일 기본그룹으로 래핑한다", () => {
    const raw = [{ label: "전압", value: "220V" }];
    expect(parseSpecs(raw)).toEqual([
      { group: "", icon: "settings", items: [{ label: "전압", value: "220V" }] },
    ]);
  });

  test("아이콘이 enum 밖이면 settings로 강등한다", () => {
    const raw = [{ group: "x", icon: "evil<script>", items: [{ label: "a", value: "b" }] }];
    expect(parseSpecs(raw)[0].icon).toBe("settings");
  });

  test("비배열/빈/비정형은 []", () => {
    expect(parseSpecs({})).toEqual([]);
    expect(parseSpecs(null)).toEqual([]);
    expect(parseSpecs([{ nope: 1 }])).toEqual([]);
  });
});

describe("serializeSpecs", () => {
  test("빈 그룹·빈 아이템 제거 + 트림, 순서 보존", () => {
    const input = [
      { group: " 성능 ", icon: "gauge" as const, items: [{ label: " 속도 ", value: " 10 " }, { label: "", value: "" }] },
      { group: "빈그룹", icon: "box" as const, items: [{ label: "", value: "" }] },
    ];
    expect(serializeSpecs(input)).toEqual([
      { group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] },
    ]);
  });
});

test("SPEC_ICONS는 9종 고정 enum", () => {
  expect(SPEC_ICONS).toEqual([
    "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
  ]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- specs`
Expected: FAIL (SPEC_ICONS·그룹형 미구현)

- [ ] **Step 3: 구현** — `packages/shared/src/specs.ts` 전체 교체

```ts
// 장비 사양 = 아이콘 그룹 + 항목/값 행(순서 보존). DB는 jsonb, 도메인은 SpecGroup[].
// 평면 [{label,value}](레거시 E1~E3)는 읽기 시 단일 기본그룹으로 하위호환 래핑.

export const SPEC_ICONS = [
  "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
] as const;
export type SpecIcon = (typeof SPEC_ICONS)[number];

export interface SpecItem {
  label: string;
  value: string;
}
export interface SpecGroup {
  group: string;
  icon: SpecIcon;
  items: SpecItem[];
}

function coerceIcon(raw: unknown): SpecIcon {
  return (SPEC_ICONS as readonly string[]).includes(raw as string)
    ? (raw as SpecIcon)
    : "settings";
}

function parseItems(raw: unknown): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({ label: String(r.label), value: String(r.value) }));
}

// DB jsonb(any) → SpecGroup[]. 그룹형/평면 레거시/비정형 3입력을 방어적으로 정규화.
export function parseSpecs(raw: unknown): SpecGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0];
  // 평면 레거시: 첫 원소가 {label,value} → 단일 기본그룹 래핑
  if (typeof first === "object" && first !== null && "label" in first && "value" in first) {
    return [{ group: "", icon: "settings", items: parseItems(raw) }];
  }
  // 그룹형
  return raw
    .filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null && "items" in g)
    .map((g) => ({
      group: typeof g.group === "string" ? g.group : "",
      icon: coerceIcon(g.icon),
      items: parseItems(g.items),
    }));
}

// SpecGroup[] → DB 저장용. 빈 아이템 제거·트림, 아이템 0개 그룹 제거, 순서 보존.
export function serializeSpecs(groups: SpecGroup[]): SpecGroup[] {
  return groups
    .map((g) => ({
      group: g.group.trim(),
      icon: g.icon,
      items: g.items
        .map((i) => ({ label: i.label.trim(), value: i.value.trim() }))
        .filter((i) => i.label !== "" || i.value !== ""),
    }))
    .filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- specs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/specs.ts packages/shared/src/specs.test.ts
git commit -m "feat: equipment 사양을 아이콘 그룹 구조로 확장(평면 레거시 하위호환)"
```

---

## Task 2: shared — biz_no 체크섬 순수함수

**Files:**
- Create: `packages/shared/src/biz-no.ts`
- Test: `packages/shared/src/biz-no.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 실패 테스트 작성** — `packages/shared/src/biz-no.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { validateBizNo } from "./biz-no";

describe("validateBizNo (국세청 체크섬)", () => {
  test("유효한 사업자번호 통과", () => {
    // 공개 예시(국세청 알고리즘 충족): 1208800998
    expect(validateBizNo("1208800998")).toBe(true);
    expect(validateBizNo("120-88-00998")).toBe(true); // 하이픈 허용
  });

  test("체크섬 불일치는 false", () => {
    expect(validateBizNo("1234567890")).toBe(false);
  });

  test("길이/형식 오류는 false", () => {
    expect(validateBizNo("123")).toBe(false);
    expect(validateBizNo("12345678a0")).toBe(false);
    expect(validateBizNo("")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- biz-no`
Expected: FAIL (validateBizNo 미정의)

- [ ] **Step 3: 구현** — `packages/shared/src/biz-no.ts`

```ts
// 사업자등록번호 체크섬 — 국세청 공식 가중치 알고리즘. 클라(zod refine)·서버(RPC)가 공유하는 순수함수.
// 알고리즘: 가중치 [1,3,7,1,3,7,1,3,5]를 앞 9자리에 곱해 합 → + floor(d9*5/10) →
// (10 - (합 % 10)) % 10 == d10 이면 유효.
const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function validateBizNo(input: string): boolean {
  const d = input.replace(/-/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * WEIGHTS[i];
  sum += Math.floor((digits[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === digits[9];
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- biz-no`
Expected: PASS. (만약 예시 `1208800998`이 FAIL이면 알고리즘이 아니라 테스트 예시 오류 — 알고리즘은 위가 표준. `validateBizNo`로 유효 예시를 생성해 교체할 것: 임의 9자리 뒤 검증식으로 d10 산출.)

- [ ] **Step 5: export 추가** — `packages/shared/src/index.ts`에 한 줄 추가

```ts
export * from "./biz-no";
```

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/biz-no.ts packages/shared/src/biz-no.test.ts packages/shared/src/index.ts
git commit -m "feat: 사업자등록번호 체크섬 순수함수(validateBizNo) 추가"
```

---

## Task 3: shared — 도메인 타입 갱신

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: 타입 수정** — `packages/shared/src/types.ts`

`import type { Spec } from "./specs";` → `import type { SpecGroup } from "./specs";`로 변경하고, 아래 인터페이스를 교체:

```ts
export interface Equipment {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  base_price: number;
  photos: string[];
  highlights: string[];      // 요약 불릿(P-A)
  specs: SpecGroup[];        // 아이콘 그룹 구조(P-A)
  youtube_urls: string[];    // 복수 영상(P-A)
  status: EquipmentStatus;
  created_at: string;
}

export interface EquipmentPublic {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
  highlights: string[];
  specs: SpecGroup[];
  youtube_urls: string[];
  created_at: string;
}
```

`Application` 인터페이스에 동의·equipment_id 추가:

```ts
export interface Application {
  id: string;
  seq_no: string;
  company: string;
  ceo: string | null;
  biz_no: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ApplicationStatus;
  assignee_id: string | null;
  equipment_id: string | null;        // FK(P-A)
  privacy_consent: boolean;           // 동의 여부(P-A)
  privacy_consent_at: string | null;  // 동의 시각(P-A)
  privacy_consent_version: string | null; // 동의 버전(P-A)
  fields: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
}
```

- [ ] **Step 2: 타입체크** (구현 코드가 아직 안 맞을 수 있음 — queries.ts는 Task 9에서 정리. 여기선 shared만)

Run: `pnpm --filter @jhtechsaas/shared typecheck`
Expected: PASS (shared 내부 정합)

- [ ] **Step 3: 커밋**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: Equipment·Application 도메인 타입에 P-A 신규 필드 반영"
```

---

## Task 4: 마이그레이션 M1 — equipment 컬럼·뷰·specs 데이터

**Files:**
- Create: `supabase/migrations/20260601170001_equipment_pa.sql`, `..._rollback.sql`
- Test: `packages/db-tests/src/equipment.test.ts` (신컬럼 단언 추가)

- [ ] **Step 1: 실패 db-test 추가** — `packages/db-tests/src/equipment.test.ts` describe 안에 추가

```ts
test("equipment_public 뷰가 highlights·youtube_urls 노출, youtube_url 컬럼 없음", async () => {
  await inRollbackTx(c, async () => {
    await asPostgres(c);
    const cols = await c.query(
      "select column_name from information_schema.columns where table_name='equipment_public'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toContain("highlights");
    expect(names).toContain("youtube_urls");
    expect(names).not.toContain("youtube_url");
  });
});

test("equipment 본 테이블에 highlights·youtube_urls 존재, youtube_url 제거됨", async () => {
  await inRollbackTx(c, async () => {
    await asPostgres(c);
    const cols = await c.query(
      "select column_name from information_schema.columns where table_name='equipment' and table_schema='public'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toContain("highlights");
    expect(names).toContain("youtube_urls");
    expect(names).not.toContain("youtube_url");
  });
});
```

- [ ] **Step 2: 실패 확인** (로컬 DB 미반영 상태)

Run: `pnpm --filter @jhtechsaas/db-tests test:rls -- equipment`
Expected: FAIL (highlights 컬럼 없음)

- [ ] **Step 3: 마이그레이션 작성** — `supabase/migrations/20260601170001_equipment_pa.sql`

```sql
-- M2 P-A — equipment: highlights·youtube_urls 추가, specs 그룹구조 전환, 공개뷰 재생성.
alter table public.equipment
  add column highlights text[] not null default '{}',
  add column youtube_urls text[] not null default '{}';

-- youtube_url 단일 → 배열 백필
update public.equipment set youtube_urls = array[youtube_url] where youtube_url is not null;

-- specs 평면 [{label,value}] → [{group:'',icon:'settings',items:[...]}]
update public.equipment set specs =
  jsonb_build_array(jsonb_build_object('group', '', 'icon', 'settings', 'items', specs))
  where jsonb_typeof(specs) = 'array'
    and jsonb_array_length(specs) > 0
    and (specs->0) ? 'label';

-- 공개뷰가 youtube_url 의존 → drop + recreate 후 컬럼 drop
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, highlights, specs, youtube_urls, created_at
  from public.equipment
  where status = 'active';
grant select on public.equipment_public to anon, authenticated;

alter table public.equipment drop column youtube_url;
```

- [ ] **Step 4: rollback 스크립트** — `supabase/migrations/20260601170001_equipment_pa_rollback.sql`

```sql
-- rollback: equipment_pa
alter table public.equipment add column youtube_url text;
update public.equipment set youtube_url = youtube_urls[1] where array_length(youtube_urls,1) >= 1;
drop view public.equipment_public;
create view public.equipment_public with (security_invoker = false, security_barrier = true) as
  select id, name, model, category, photos, specs, youtube_url, created_at
  from public.equipment where status = 'active';
grant select on public.equipment_public to anon, authenticated;
alter table public.equipment drop column highlights;
alter table public.equipment drop column youtube_urls;
-- 주: specs 그룹→평면 역변환은 데이터 손실 가능(그룹명·아이콘 폐기). 필요 시 수동.
```

- [ ] **Step 5: 로컬 반영 후 통과 확인**

Run: `supabase migration up && pnpm --filter @jhtechsaas/db-tests test:rls -- equipment`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260601170001_equipment_pa.sql supabase/migrations/20260601170001_equipment_pa_rollback.sql packages/db-tests/src/equipment.test.ts
git commit -m "feat: equipment에 highlights·youtube_urls·그룹사양 마이그레이션(공개뷰 재생성)"
```

---

## Task 5: 마이그레이션 M2 — applications 동의 3컬럼 + equipment_id FK

**Files:**
- Create: `supabase/migrations/20260601170002_applications_pa.sql`, `..._rollback.sql`
- Test: `packages/db-tests/src/applications.test.ts` (신컬럼 단언 추가)

- [ ] **Step 1: 실패 db-test 추가** — `packages/db-tests/src/applications.test.ts`

```ts
test("applications에 동의 3컬럼 + equipment_id FK 존재, 기존행 consent=false", async () => {
  await inRollbackTx(c, async () => {
    await asPostgres(c);
    const cols = await c.query(
      "select column_name from information_schema.columns where table_name='applications' and table_schema='public'",
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining(["privacy_consent", "privacy_consent_at", "privacy_consent_version", "equipment_id"]),
    );
    // equipment_id FK 존재
    const fk = await c.query(
      `select 1 from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
       where tc.table_name='applications' and tc.constraint_type='FOREIGN KEY' and ccu.table_name='equipment'`,
    );
    expect(fk.rowCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/db-tests test:rls -- applications`
Expected: FAIL

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260601170002_applications_pa.sql`

```sql
-- M2 P-A — applications: 개인정보 동의 3컬럼 + equipment_id FK.
alter table public.applications
  add column privacy_consent boolean not null default false,
  add column privacy_consent_at timestamptz,
  add column privacy_consent_version text,
  add column equipment_id uuid references public.equipment(id);

-- 기존 fields.equipment_id → 실제 컬럼 백필(uuid 형식인 것만)
update public.applications set equipment_id = (fields->>'equipment_id')::uuid
  where fields ? 'equipment_id' and fields->>'equipment_id' ~ '^[0-9a-f-]{36}$';

create index on public.applications (equipment_id);
```

- [ ] **Step 4: rollback** — `supabase/migrations/20260601170002_applications_pa_rollback.sql`

```sql
-- rollback: applications_pa
alter table public.applications drop column equipment_id;
alter table public.applications drop column privacy_consent;
alter table public.applications drop column privacy_consent_at;
alter table public.applications drop column privacy_consent_version;
```

- [ ] **Step 5: 반영·통과 확인**

Run: `supabase migration up && pnpm --filter @jhtechsaas/db-tests test:rls -- applications`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260601170002_applications_pa.sql supabase/migrations/20260601170002_applications_pa_rollback.sql packages/db-tests/src/applications.test.ts
git commit -m "feat: applications에 개인정보 동의 3컬럼·equipment_id FK 마이그레이션"
```

---

## Task 6: 마이그레이션 M3 — privacy_policies + RLS 4정책

**Files:**
- Create: `supabase/migrations/20260601170003_privacy_policies.sql`, `..._rollback.sql`
- Test: `packages/db-tests/src/privacy_policies.test.ts`

- [ ] **Step 1: 실패 db-test 작성** — `packages/db-tests/src/privacy_policies.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("privacy_policies RLS", () => {
  test("anon은 SELECT 가능(동의 문구 표시)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select version from public.privacy_policies where version='v1.0'");
      expect(r.rowCount).toBeGreaterThan(0);
    });
  });

  test("anon은 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });

  test("users.manage 없는 로그인 사용자는 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@x.com");
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/db-tests test:rls -- privacy_policies`
Expected: FAIL (테이블 없음)

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260601170003_privacy_policies.sql`

```sql
-- M2 P-A — 개인정보처리방침 버전 테이블. 동의 시 version 기록.
create table public.privacy_policies (
  id uuid primary key default gen_random_uuid(),
  version text unique not null,
  body text not null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.privacy_policies enable row level security;

-- 동의 문구는 공개 표시 → anon·authenticated SELECT.
create policy privacy_policies_select on public.privacy_policies
  for select to anon, authenticated using (true);

create policy privacy_policies_insert on public.privacy_policies
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy privacy_policies_update on public.privacy_policies
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')))
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy privacy_policies_delete on public.privacy_policies
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));

-- 플레이스홀더 v1.0(법무 확정 후 행 업데이트/신버전).
insert into public.privacy_policies (version, body)
values ('v1.0', '[플레이스홀더 — 법무 확정 후 교체]');
```

- [ ] **Step 4: rollback** — `supabase/migrations/20260601170003_privacy_policies_rollback.sql`

```sql
-- rollback: privacy_policies
drop table public.privacy_policies;
```

- [ ] **Step 5: 반영·통과 확인**

Run: `supabase migration up && pnpm --filter @jhtechsaas/db-tests test:rls -- privacy_policies`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260601170003_privacy_policies.sql supabase/migrations/20260601170003_privacy_policies_rollback.sql packages/db-tests/src/privacy_policies.test.ts
git commit -m "feat: privacy_policies 버전 테이블 + RLS 4정책 + v1.0 seed"
```

---

## Task 7: 마이그레이션 M4 — customer-uploads 버킷 + 정책

**Files:**
- Create: `supabase/migrations/20260601170004_customer_uploads_bucket.sql`, `..._rollback.sql`
- Test: `packages/db-tests/src/customer_uploads.test.ts`

- [ ] **Step 1: 실패 db-test 작성** — `packages/db-tests/src/customer_uploads.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("customer-uploads 버킷 RLS", () => {
  test("버킷 존재(private, 5MB, image 3종)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "select public, file_size_limit, allowed_mime_types from storage.buckets where id='customer-uploads'",
      );
      expect(r.rows[0].public).toBe(false);
      expect(Number(r.rows[0].file_size_limit)).toBe(5242880);
      expect(r.rows[0].allowed_mime_types).toEqual(
        expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]),
      );
    });
  });

  test("anon은 customer-uploads에 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query(
        `insert into storage.objects (bucket_id, name, owner) values ('customer-uploads', $1, null)`,
        ["00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg"],
      );
      // 성공하면 예외 없음
    });
  });

  test("권한 없는 로그인 사용자는 customer-uploads SELECT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(
        `insert into storage.objects (bucket_id, name) values ('customer-uploads', 'x/ext_entrance.jpg')`,
      );
      await seedAuthUser(c, UID.sales2, "s2@x.com");
      await asUser(c, UID.sales2);
      const r = await c.query("select id from storage.objects where bucket_id='customer-uploads'");
      expect(r.rowCount).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/db-tests test:rls -- customer_uploads`
Expected: FAIL

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260601170004_customer_uploads_bucket.sql`

```sql
-- M2 P-A — 고객 현장 사진 업로드 버킷(private). anon INSERT만, 스태프(applications.view_all) read.
-- 고아 청소 cron은 후속(P-D 워커/jobs 큐). 여기선 버킷·정책만.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-uploads', 'customer-uploads', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "customer_uploads_insert_anon" on storage.objects
  for insert to anon
  with check (bucket_id = 'customer-uploads');

create policy "customer_uploads_read_staff" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );
```

- [ ] **Step 4: rollback** — `supabase/migrations/20260601170004_customer_uploads_bucket_rollback.sql`

```sql
-- rollback: customer_uploads_bucket
drop policy "customer_uploads_insert_anon" on storage.objects;
drop policy "customer_uploads_read_staff" on storage.objects;
delete from storage.objects where bucket_id = 'customer-uploads';
delete from storage.buckets where id = 'customer-uploads';
```

- [ ] **Step 5: 반영·통과 확인**

Run: `supabase migration up && pnpm --filter @jhtechsaas/db-tests test:rls -- customer_uploads`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260601170004_customer_uploads_bucket.sql supabase/migrations/20260601170004_customer_uploads_bucket_rollback.sql packages/db-tests/src/customer_uploads.test.ts
git commit -m "feat: customer-uploads 버킷(private)+anon insert·스태프 read 정책"
```

---

## Task 8: 마이그레이션 M5 — submit_application RPC v2

**Files:**
- Create: `supabase/migrations/20260601170005_submit_application_v2.sql`, `..._rollback.sql`
- Test: `packages/db-tests/src/submit_application.test.ts` (v2 단언 추가)

- [ ] **Step 1: 실패 db-test 추가** — `submit_application.test.ts`의 payload 헬퍼를 확장하고 v2 테스트 추가

payload 헬퍼에 동의 기본값을 더한다:

```ts
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    company: "RPC상사", ceo: "홍길동", biz_no: "1208800998",
    phone: "0212345678", email: "a@b.com", address: "서울",
    privacy_consent: true, privacy_consent_version: "v1.0",
    fields: { requirements: "테스트", equipment_id: "00000000-0000-0000-0000-0000000000e1" },
    ...over,
  });
```

테스트 추가:

```ts
test("동의(privacy_consent=true) 저장 + version·at 기록", async () => {
  await inRollbackTx(c, async () => {
    await asPostgres(c);
    // equipment fixture(equipment_id 검증 통과용)
    await c.query(
      "insert into public.equipment (id, name, status) values ('00000000-0000-0000-0000-0000000000e1','테스트장비','active')",
    );
    await asAnon(c);
    await c.query("select public.submit_application($1::jsonb)", [payload({ company: "동의상사" })]);
    await asPostgres(c);
    const row = await c.query(
      "select privacy_consent, privacy_consent_version, privacy_consent_at, equipment_id from public.applications where company='동의상사'",
    );
    expect(row.rows[0].privacy_consent).toBe(true);
    expect(row.rows[0].privacy_consent_version).toBe("v1.0");
    expect(row.rows[0].privacy_consent_at).not.toBeNull();
    expect(row.rows[0].equipment_id).toBe("00000000-0000-0000-0000-0000000000e1");
  });
});

test("privacy_consent≠true면 예외", async () => {
  await inRollbackTx(c, async () => {
    await asAnon(c);
    await expect(
      c.query("select public.submit_application($1::jsonb)", [payload({ privacy_consent: false })]),
    ).rejects.toThrow();
  });
});

test("photos 경로 형식 위반 시 예외", async () => {
  await inRollbackTx(c, async () => {
    await asAnon(c);
    await expect(
      c.query("select public.submit_application($1::jsonb)", [
        payload({ fields: { photos: { ext_entrance: "../evil.jpg" } } }),
      ]),
    ).rejects.toThrow();
  });
});

test("biz_no 체크섬 불일치 시 예외", async () => {
  await inRollbackTx(c, async () => {
    await asAnon(c);
    await expect(
      c.query("select public.submit_application($1::jsonb)", [payload({ biz_no: "1234567890" })]),
    ).rejects.toThrow();
  });
});
```

> 주: 기존 테스트들의 payload는 `privacy_consent`가 없으면 v2에서 거부되므로, 위 헬퍼 교체로 일괄 통과. equipment_id 검증이 붙으므로 기존 테스트가 참조하는 `...e1` equipment fixture를 각 테스트에 삽입하거나, equipment_id 없는 payload로 바꾼다(아래 Step3에서 equipment_id는 선택이라 null 허용).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/db-tests test:rls -- submit_application`
Expected: FAIL (v2 미구현 — consent 무시·예외 안 남)

- [ ] **Step 3: 마이그레이션** — `supabase/migrations/20260601170005_submit_application_v2.sql`

```sql
-- M2 P-A — submit_application v2: 개인정보 동의·equipment_id·현장사진·설치설문 수용.
-- 익명 위조 차단을 위해 status='new'·assignee=null 하드코딩 유지. 동의 미동의 거부.
-- biz_no 체크섬은 서버 재검증(클라 zod와 이중). photos 경로는 정규식 강제(경로조작 차단).
create or replace function public.submit_application(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(payload->>'company'), '');
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_biz text := regexp_replace(coalesce(payload->>'biz_no',''), '-', '', 'g');
  v_consent boolean := coalesce((payload->>'privacy_consent')::boolean, false);
  v_consent_ver text := nullif(btrim(payload->>'privacy_consent_version'), '');
  v_equipment_id uuid;
  v_photos jsonb := coalesce(v_fields->'photos', '{}'::jsonb);
  v_slot text;
  v_path text;
  v_weights int[] := array[1,3,7,1,3,7,1,3,5];
  v_sum int := 0;
  v_i int;
  v_seq text;
begin
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;

  -- 개인정보 동의 필수
  if v_consent is not true then
    raise exception '개인정보 수집·이용 동의가 필요합니다';
  end if;
  if v_consent_ver is null then
    raise exception '동의 버전이 누락되었습니다';
  end if;

  -- 길이 캡(anon 남용·저장소 폭주 방지)
  if length(v_company) > 200
     or coalesce(length(payload->>'ceo'), 0) > 200
     or coalesce(length(payload->>'biz_no'), 0) > 200
     or coalesce(length(payload->>'phone'), 0) > 200
     or coalesce(length(payload->>'email'), 0) > 200
     or coalesce(length(payload->>'address'), 0) > 500
     or coalesce(length(v_fields->>'requirements'), 0) > 2000
     or octet_length(v_fields::text) > 8192 then
    raise exception '입력값이 허용 길이를 초과했습니다';
  end if;

  -- biz_no 체크섬(국세청 가중치). 값이 있을 때만 검증.
  if v_biz <> '' then
    if v_biz !~ '^\d{10}$' then
      raise exception '사업자등록번호 형식이 올바르지 않습니다';
    end if;
    for v_i in 1..9 loop
      v_sum := v_sum + (substr(v_biz, v_i, 1)::int) * v_weights[v_i];
    end loop;
    v_sum := v_sum + floor((substr(v_biz, 9, 1)::int) * 5 / 10);
    if ((10 - (v_sum % 10)) % 10) <> substr(v_biz, 10, 1)::int then
      raise exception '사업자등록번호 체크섬이 일치하지 않습니다';
    end if;
  end if;

  -- equipment_id(선택): 형식 + active 검증
  if nullif(payload->>'equipment_id', '') is not null then
    v_equipment_id := (payload->>'equipment_id')::uuid;
    if not exists (select 1 from public.equipment where id = v_equipment_id and status = 'active') then
      raise exception '유효하지 않은 장비입니다';
    end if;
  elsif nullif(v_fields->>'equipment_id', '') is not null then
    v_equipment_id := (v_fields->>'equipment_id')::uuid;
    if not exists (select 1 from public.equipment where id = v_equipment_id and status = 'active') then
      raise exception '유효하지 않은 장비입니다';
    end if;
  end if;

  -- photos 경로 정규식 강제(경로조작·타버킷 차단)
  for v_slot in select jsonb_object_keys(v_photos) loop
    if v_slot not in ('ext_entrance','ext_building','int_entrance','int_location') then
      raise exception '허용되지 않은 사진 슬롯입니다';
    end if;
    v_path := v_photos->>v_slot;
    if v_path is not null and v_path !~ ('^customer-uploads/[0-9a-f-]{36}/' || v_slot || '\.(jpg|png|webp)$') then
      raise exception '사진 경로 형식이 올바르지 않습니다';
    end if;
  end loop;

  insert into public.applications
    (company, ceo, biz_no, phone, email, address, equipment_id,
     privacy_consent, privacy_consent_at, privacy_consent_version,
     fields, status, assignee_id, submitted_at)
  values (
    v_company,
    nullif(btrim(payload->>'ceo'), ''),
    nullif(v_biz, ''),
    nullif(btrim(payload->>'phone'), ''),
    nullif(btrim(payload->>'email'), ''),
    nullif(btrim(payload->>'address'), ''),
    v_equipment_id,
    true,            -- 동의 강제 기록
    now(),
    v_consent_ver,
    v_fields,
    'new',           -- 하드코딩 강제
    null,            -- 하드코딩 강제(미배정)
    now()
  )
  returning seq_no into v_seq;

  return v_seq;
end;
$$;

revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
```

- [ ] **Step 4: rollback** — `supabase/migrations/20260601170005_submit_application_v2_rollback.sql`

```sql
-- rollback: submit_application v2 → 원복은 E3 원본 함수 재적용(20260531120000_submit_application.sql 내용).
-- 운영 롤백 시 해당 원본 파일을 재실행할 것. (여기서는 의도만 명시)
```

- [ ] **Step 5: 반영·통과 확인 (전체 db-tests)**

Run: `supabase migration up && pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260601170005_submit_application_v2.sql supabase/migrations/20260601170005_submit_application_v2_rollback.sql packages/db-tests/src/submit_application.test.ts
git commit -m "feat: submit_application v2(동의·equipment_id·사진경로·체크섬 검증)"
```

---

## Task 9: web — equipment zod 스키마 갱신

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts`
- Test: `apps/web/src/lib/equipment/schema.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `apps/web/src/lib/equipment/schema.test.ts`

```ts
test("youtube_urls 배열: YouTube 호스트만 통과", () => {
  const ok = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: ["가벼움"], youtube_urls: ["https://youtu.be/abc"],
    specs: [], photos: [], options: [],
  });
  expect(ok.success).toBe(true);
});

test("youtube_urls에 비유튜브 URL 있으면 실패", () => {
  const bad = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: ["https://evil.com/x"],
    specs: [], photos: [], options: [],
  });
  expect(bad.success).toBe(false);
});

test("specs 그룹형: group+icon(enum)+items", () => {
  const ok = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: [],
    specs: [{ group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] }],
    photos: [], options: [],
  });
  expect(ok.success).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test -- equipment/schema` (또는 web의 vitest 스크립트)
Expected: FAIL

- [ ] **Step 3: 스키마 수정** — `apps/web/src/lib/equipment/schema.ts`

`specEntrySchema`를 그룹 구조로 교체하고, `youtube_url`을 `youtube_urls`로, `highlights` 추가:

```ts
import { z } from "zod";
import { SPEC_ICONS } from "@jhtechsaas/shared";

export const specItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const specGroupSchema = z.object({
  group: z.string(),
  icon: z.enum(SPEC_ICONS),
  items: z.array(specItemSchema),
});

export const optionEntrySchema = z.object({
  kind: z.enum(["included", "extra"]),
  name: z.string(),
  price: z.number({ message: "올바른 금액을 입력하세요" }).min(0, "올바른 금액을 입력하세요"),
});

const youtubeUrl = z.union([
  z.literal(""),
  z.string().regex(/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//, "유효한 YouTube 링크가 아닙니다"),
]);

export const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "장비명을 입력하세요"),
  model: z.string().trim().default(""),
  category: z.string().trim().default(""),
  base_price: z.number({ message: "올바른 금액을 입력하세요" }).min(0, "올바른 금액을 입력하세요"),
  status: z.enum(["active", "inactive"]),
  highlights: z.array(z.string()).default([]),
  youtube_urls: z.array(youtubeUrl).default([]),
  specs: z.array(specGroupSchema).default([]),
  photos: z.array(
    z.string().regex(/^equipment\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i, "잘못된 이미지 경로"),
  ).default([]),
  options: z.array(optionEntrySchema).default([]),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
export type SpecGroupDraft = z.infer<typeof specGroupSchema>;
export type OptionDraft = z.infer<typeof optionEntrySchema>;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web test -- equipment/schema`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/lib/equipment/schema.test.ts
git commit -m "feat: equipment 폼 스키마에 highlights·youtube_urls·그룹사양 반영"
```

---

## Task 10: web — SpecGroupIcon 인라인 SVG 컴포넌트

**Files:**
- Create: `apps/web/src/components/SpecGroupIcon.tsx`

신규 npm 의존성 없이, 9종 아이콘을 단순·정확한 인라인 SVG로 매핑한다(디자이너가 후속에서 교체 가능).

- [ ] **Step 1: 컴포넌트 작성** — `apps/web/src/components/SpecGroupIcon.tsx`

```tsx
import type { SpecIcon } from "@jhtechsaas/shared";

// 그룹 사양 아이콘 — 고정 enum(9종)만. 임의 문자열 불가 → XSS 0.
// 단순 기하 SVG(스트로크 currentColor). 디자인 폴리시는 후속에서 lucide 등으로 교체 가능.
const PATHS: Record<SpecIcon, React.ReactNode> = {
  gauge: <><path d="M12 14l4-4" /><circle cx="12" cy="14" r="7" /></>,
  ruler: <><rect x="3" y="8" width="18" height="8" rx="1" /><path d="M7 8v3M11 8v4M15 8v3" /></>,
  droplet: <path d="M12 3c3 4 5 6.5 5 9a5 5 0 1 1-10 0c0-2.5 2-5 5-9z" />,
  power: <><path d="M12 3v8" /><path d="M6 7a8 8 0 1 0 12 0" /></>,
  wind: <><path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /></>,
  thermometer: <><path d="M12 3a2 2 0 0 1 2 2v9a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z" /></>,
  weight: <><path d="M5 8h14l1 12H4L5 8z" /><circle cx="12" cy="5" r="2" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
};

export function SpecGroupIcon({ icon, className }: { icon: SpecIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {PATHS[icon]}
    </svg>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS (SpecGroupIcon만 — 폼 배선은 Task 11)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/SpecGroupIcon.tsx
git commit -m "feat: 그룹사양 아이콘(SpecGroupIcon) 인라인 SVG 9종"
```

---

## Task 11: web — admin 입력 UI (그룹 SpecEditor·highlights·복수 youtube)

**Files:**
- Create: `apps/web/src/app/admin/equipment/_components/HighlightsEditor.tsx`
- Create: `apps/web/src/app/admin/equipment/_components/YoutubeUrlsEditor.tsx`
- Modify: `apps/web/src/app/admin/equipment/_components/SpecEditor.tsx` (그룹형 재작성)
- Modify: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` (배선·defaultValues)

- [ ] **Step 1: HighlightsEditor 작성** — 불릿 문자열 배열 useFieldArray

```tsx
"use client";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 요약 불릿 에디터 — 문자열 배열. react-hook-form useFieldArray는 원시값 배열을 직접 못 다뤄
// {value:string} 래핑 대신 name 인덱스로 register한다.
export function HighlightsEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "highlights" as never });
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">요약(highlights)</h2>
        <button type="button" onClick={() => append("" as never)} className="text-small font-medium text-accent hover:underline">+ 불릿 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">요약 불릿이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <input {...register(`highlights.${index}` as const)} placeholder="예: 시간당 1,200매 처리" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
              <button type="button" onClick={() => remove(index)} className="text-small text-danger hover:underline">삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: YoutubeUrlsEditor 작성** — 동일 패턴, name="youtube_urls", placeholder는 YouTube URL

```tsx
"use client";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

export function YoutubeUrlsEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "youtube_urls" as never });
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">제품 영상(YouTube, 복수)</h2>
        <button type="button" onClick={() => append("" as never)} className="text-small font-medium text-accent hover:underline">+ 영상 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">영상이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <input {...register(`youtube_urls.${index}` as const)} placeholder="https://youtu.be/..." className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
              <button type="button" onClick={() => remove(index)} className="text-small text-danger hover:underline">삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: SpecEditor 그룹형 재작성** — `SpecEditor.tsx` 전체 교체(그룹 + 아이콘 드롭다운 + 하위 items 중첩 useFieldArray)

```tsx
"use client";
import { useFieldArray, useFormContext, type Control, type UseFormRegister } from "react-hook-form";
import { SPEC_ICONS } from "@jhtechsaas/shared";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 그룹 사양 에디터 — 그룹(이름+아이콘) + 하위 items(label/value). 그룹/아이템 순서 이동.
export function SpecEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "specs" });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">사양</h2>
        <button type="button" onClick={() => append({ group: "", icon: "settings", items: [{ label: "", value: "" }] })} className="text-small font-medium text-accent hover:underline">+ 그룹 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">사양 그룹이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {fields.map((field, gIndex) => (
            <li key={field.id} className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <select {...register(`specs.${gIndex}.icon`)} className="rounded-sm border border-border bg-surface px-2 py-1 text-body text-text">
                  {SPEC_ICONS.map((ic) => (<option key={ic} value={ic}>{ic}</option>))}
                </select>
                <input {...register(`specs.${gIndex}.group`)} placeholder="그룹명 (예: 성능)" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
                <button type="button" onClick={() => gIndex > 0 && move(gIndex, gIndex - 1)} className="text-muted">↑</button>
                <button type="button" onClick={() => gIndex < fields.length - 1 && move(gIndex, gIndex + 1)} className="text-muted">↓</button>
                <button type="button" onClick={() => remove(gIndex)} className="text-small text-danger hover:underline">그룹삭제</button>
              </div>
              <SpecItems gIndex={gIndex} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 중첩 useFieldArray는 useFormContext로 control 획득(부모가 FormProvider로 감쌈 — Step 4).
function SpecItems({ gIndex }: { gIndex: number }) {
  const { control, register } = useFormContext<FormInput>();
  const { fields, append, remove } = useFieldArray({ control, name: `specs.${gIndex}.items` as const });
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, iIndex) => (
        <div key={f.id} className="flex items-center gap-2">
          <input {...register(`specs.${gIndex}.items.${iIndex}.label`)} placeholder="항목 (예: 속도)" className="w-40 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
          <input {...register(`specs.${gIndex}.items.${iIndex}.value`)} placeholder="값 (예: 1200매/h)" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 font-mono text-body text-text" />
          <button type="button" onClick={() => remove(iIndex)} className="text-small text-danger hover:underline">삭제</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ label: "", value: "" })} className="self-start text-small font-medium text-accent hover:underline">+ 항목</button>
    </div>
  );
}
```

- [ ] **Step 4: EquipmentForm 배선** — `EquipmentForm.tsx` 수정

(a) `useForm`을 `FormProvider`로 감싸도록 변경(중첩 useFieldArray가 useFormContext 사용). import에 `FormProvider` 추가:

```ts
import { useForm, useController, FormProvider } from "react-hook-form";
```

(b) defaultValues(create 모드) 교체 — `youtube_url` 제거, 신규 필드 추가:

```ts
: {
    name: "", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: [],
    specs: [{ group: "", icon: "settings", items: [{ label: "", value: "" }] }],
    photos: [], options: [],
  },
```

(c) `const methods = useForm(...)` 형태로 받고 `const { register, handleSubmit, control, formState } = methods;`로 분해. JSX 최상위를 `<FormProvider {...methods}>`로 감싼다.

(d) §1 기본정보 섹션의 `YouTube URL(선택)` Field 블록(154-159행) 삭제.

(e) §2 영역에 신규 에디터 배치(SpecEditor 위/아래):

```tsx
import { HighlightsEditor } from "./HighlightsEditor";
import { YoutubeUrlsEditor } from "./YoutubeUrlsEditor";
// ...
<HighlightsEditor control={control} register={register} />
<SpecEditor control={control} register={register} />
<YoutubeUrlsEditor control={control} register={register} />
```

- [ ] **Step 5: 빌드·타입·린트 통과 확인**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: PASS, `as any` 0(`as never`는 RHF 원시배열 한정 — 주석으로 사유 명시)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/app/admin/equipment/_components/
git commit -m "feat: admin 장비폼에 highlights·복수 youtube·그룹사양(아이콘) 입력 UI"
```

---

## Task 12: web — 조회·서버액션 신컬럼 정합 + 최종 게이트

**Files:**
- Modify: `apps/web/src/lib/equipment/queries.ts`, `apps/web/src/lib/equipment/public-queries.ts`
- Modify: `apps/web/src/app/admin/equipment/actions.ts` (insert/update에 신컬럼)
- Modify: 필요 시 `EquipmentTable.tsx`/상세 컴포넌트의 `youtube_url` 참조 제거(컴파일 에러 기준)

- [ ] **Step 1: queries 신컬럼 매핑 확인** — `queries.ts`/`public-queries.ts`에서 `select("*")` 또는 명시 컬럼이 `youtube_url`을 참조하면 `youtube_urls`로 교체, `highlights` 포함. parseSpecs는 그대로(그룹형 반환).

```ts
// public-queries.ts 예: select 컬럼에 highlights, youtube_urls 포함, youtube_url 제거
```

- [ ] **Step 2: 서버액션 insert/update에 신컬럼** — `actions.ts`의 createEquipment/updateEquipment payload에 `highlights`, `youtube_urls`, `specs`(serializeSpecs) 반영, `youtube_url` 제거.

- [ ] **Step 3: 전체 게이트 실행**

Run:
```bash
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build
grep -rn "as any" apps/web/src packages/shared/src | grep -v ".test." || echo "as any 0"
```
Expected: 전부 PASS, `as any` 0

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/equipment/ apps/web/src/app/admin/equipment/actions.ts
git commit -m "feat: 장비 조회·서버액션을 신컬럼(highlights·youtube_urls·그룹사양)에 정합"
```

---

## Self-Review 체크 결과

- **Spec coverage:** #19 P-A1 AC 1~9 매핑 — AC1·3(Task4), AC4(Task5), AC5(Task6), AC6(Task7), AC7(Task8), AC2(Task1), AC8(Task10·11), AC9(Task12). biz_no/타입(Task2·3)은 P-A2 선제 공유. ✅
- **Placeholder scan:** SQL·TS 전부 실제 코드. rollback M5만 "원본 재실행" 명시(원본 파일 존재하므로 유효). ✅
- **Type consistency:** SpecGroup/SpecItem/SpecIcon(shared) ↔ specGroupSchema(web zod) ↔ DB jsonb 일치. youtube_url 제거가 types·schema·queries·actions·form 전반에 일관 반영. ✅

## 주의(실행 시)
- Task 2 biz_no 테스트의 "유효 예시"가 알고리즘과 안 맞으면 **알고리즘이 표준**이니 예시를 교체(임의 9자리+산출 d10). 테스트를 알고리즘에 맞춤.
- Task 8에서 기존 submit_application 테스트들이 v2의 동의 필수 때문에 깨질 수 있음 → payload 헬퍼에 동의 기본값 추가로 일괄 해결(Step1에 반영).
- 중첩 useFieldArray(SpecItems)는 FormProvider 필수 — Task11 Step4(c) 누락 시 런타임 에러.
