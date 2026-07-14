# 본사주소 / 설치주소 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객·출고의뢰서에서 본사주소와 설치주소를 분리하고, "설치=본사 동일" 체크로 자동 채우며, 출고의뢰서 PDF에는 설치주소만 표시한다.

**Architecture:** 고객(companies)은 컬럼 재해석(라벨만) — `address`=본사주소, `address_actual1`=설치주소, `address_actual2`=주소2. 출고의뢰서(release_orders)는 `hq_address` 컬럼 신설 + RPC 10-arg로 본사주소 스냅샷 저장(발행 동결에 포함). PDF 워커는 계속 `install_address`만 읽어 무변경. 프리필은 의뢰의 연결 고객(`application.company_id`)에서 본사←`address`·설치←`address_actual1`.

**Tech Stack:** Next.js(App Router, RSC + server actions), react-hook-form, Zod4, Supabase(Postgres RLS, SECURITY DEFINER RPC, BEFORE UPDATE 동결 트리거), Vitest, Playwright, `@jhtechsaas/db-tests`, 워커 Puppeteer(PDF, 시각검증=tsx 하니스→Read).

## Global Constraints

- 단일테넌트 — capability 권한(`release_orders.write`·`customers.edit`·`applications.view_all`) + `assignee_id` 스코프 RLS.
- SQL 함수는 `SECURITY DEFINER SET search_path=''`, 스키마 정규화 참조, `revoke ... from public, anon` 후 authenticated grant.
- 마이그레이션 `supabase/migrations/`, 롤백 **`supabase/rollback/`(단수)** `<timestamp>_<name>_down.sql`.
- RLS 컬럼 불변·발행본 동결은 **BEFORE UPDATE 트리거**로 강제(service_role도 우회 불가) — 새 스냅샷 컬럼 `hq_address`도 issued 동결 목록에 추가.
- 자식/스냅샷 컬럼 추가는 기존 관례 따름(nullable text + 길이 CHECK). `install_address`는 CHECK 없이 RPC가 `left(...,1000)` 절단 → `hq_address`도 동일.
- 코드 주석 한국어. `as any` 금지. 외부/RPC 응답 Zod 검증.
- 워커 PDF는 **설치주소만** 표시(본사주소 미표시) — 워커 무변경, 시각검증만.
- 게이트: `pnpm --filter @jhtechsaas/shared test`·`web test`·`web typecheck`·`lint`(0)·`@jhtechsaas/db-tests test:rls`·`web test:e2e`·`build`·워커 `pnpm --filter @jhtechsaas/worker test`. db-tests·e2e는 클린 `supabase db reset`+`bash supabase/seed/seed-local.sh` 후.

---

### Task 1: shared 프리필 — 본사/설치 주소 분리 + hq_address

**Files:**
- Modify: `packages/shared/src/release-order.ts`
- Test: `packages/shared/src/release-order.test.ts` (없으면 신규)

**Interfaces:**
- Produces: `buildReleaseOrderPrefill` 입력에 `company?: { address?: string | null; address_actual1?: string | null } | null` 추가, 출력 `ReleaseOrderPrefill`에 `hq_address: string` 추가.
  - hq_address = `company?.address || application.address || ""`
  - install_address = `company?.address_actual1 || application.address || ""` (설치주소 없으면 본사/의뢰주소로 폴백)

- [ ] **Step 1: 실패 테스트 작성**

`packages/shared/src/release-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReleaseOrderPrefill } from "./release-order";

const base = { quote: null, deviceKind: "printer" as const };

describe("buildReleaseOrderPrefill 본사/설치 주소", () => {
  it("연결 고객 있으면 본사=address·설치=address_actual1", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: { address: "본사주소", address_actual1: "설치주소" },
    });
    expect(r.hq_address).toBe("본사주소");
    expect(r.install_address).toBe("설치주소");
  });
  it("고객 설치주소 없으면 설치=본사(폴백)", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: { address: "본사주소", address_actual1: "" },
    });
    expect(r.hq_address).toBe("본사주소");
    expect(r.install_address).toBe("본사주소");
  });
  it("연결 고객 없으면 본사·설치 모두 의뢰주소 폴백", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: null,
    });
    expect(r.hq_address).toBe("의뢰주소");
    expect(r.install_address).toBe("의뢰주소");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- release-order.test.ts`
Expected: FAIL(hq_address 없음 / company 인자 없음)

- [ ] **Step 3: 구현**

`packages/shared/src/release-order.ts` — `PrefillInput`·`ReleaseOrderPrefill`·`buildReleaseOrderPrefill` 수정:

```ts
type PrefillInput = {
  application: {
    company?: string | null;
    phone?: string | null;
    address?: string | null;
    fields?: { install_survey?: Record<string, unknown> } | null;
  };
  // 연결 고객 주소(본사·설치) — 있으면 프리필 우선. 없으면 의뢰 주소 폴백.
  company?: { address?: string | null; address_actual1?: string | null } | null;
  quote: { items?: unknown; delivery_date?: string | null; delivery_time?: string | null } | null;
  deviceKind: "printer" | "cutter" | null;
};

export type ReleaseOrderPrefill = {
  device_kind: "printer" | "cutter";
  company: string;
  contact_phone: string;
  hq_address: string;       // 본사주소(신규)
  install_address: string;  // 설치주소
  install_at: string | null;
  device_name: string;
  details: ReleaseOrderDetails;
};
```

`buildReleaseOrderPrefill` 반환부 수정(기존 `install_address: application.address ?? ""` 교체):

```ts
  const appAddr = input.application.address ?? "";
  const hq_address = (input.company?.address ?? "") || appAddr;
  const install_address = (input.company?.address_actual1 ?? "") || appAddr;
  // ...
  return {
    device_kind: deviceKind ?? "printer",
    company: application.company ?? "",
    contact_phone: application.phone ?? "",
    hq_address,
    install_address,
    install_at,
    device_name: deviceName,
    details,
  };
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- release-order.test.ts`
Expected: PASS

- [ ] **Step 5: shared 전체 테스트(회귀)**

Run: `pnpm --filter @jhtechsaas/shared test`
Expected: PASS(기존 테스트 무회귀)

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/release-order.ts packages/shared/src/release-order.test.ts
git commit -m "feat: 출고의뢰서 프리필 본사/설치 주소 분리(hq_address)"
```

---

### Task 2: 고객 폼 — 라벨 변경(본사주소·설치주소·주소2) + 동일 체크박스

**Files:**
- Create: `apps/web/src/lib/customers/install-address.ts`
- Test: `apps/web/src/lib/customers/install-address.test.ts`
- Modify: `apps/web/src/app/admin/customers/_components/CompanyForm.tsx`
- Modify: 고객 상세에서 이 주소 라벨을 쓰는 곳(있으면 통일 — grep `실제주소`)

**Interfaces:**
- Produces: `deriveSameAsHq(hq: string, install: string): boolean` — 초기 "동일" 체크 상태 파생(설치가 비었거나 본사와 같으면 true).

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/customers/install-address.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveSameAsHq } from "./install-address";

describe("deriveSameAsHq", () => {
  it("설치주소 비면 true", () => expect(deriveSameAsHq("본사", "")).toBe(true));
  it("설치=본사면 true", () => expect(deriveSameAsHq("본사", "본사")).toBe(true));
  it("공백 차이는 무시하고 같으면 true", () => expect(deriveSameAsHq(" 본사 ", "본사")).toBe(true));
  it("다르면 false", () => expect(deriveSameAsHq("본사", "설치")).toBe(false));
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test -- install-address.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`apps/web/src/lib/customers/install-address.ts`:

```ts
// 설치주소 "본사와 동일" 초기 체크 파생 — 설치가 비었거나(미입력) 본사와 같으면 동일로 본다.
export function deriveSameAsHq(hq: string, install: string): boolean {
  const i = install.trim();
  return i === "" || i === hq.trim();
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web test -- install-address.test.ts`
Expected: PASS

- [ ] **Step 5: 라벨 변경 (CompanyForm.tsx)**

`FIELD_LABELS`(약 59-65행)에서:
- `address: "주소(사업장)"` → `address: "본사주소"`
- `address_actual1: "실제주소1"` → `address_actual1: "설치주소"`
- `address_actual2: "실제주소2"` → `address_actual2: "주소2"`

"사업장" FormSectionCard(약 362-392행)의 Field 라벨도 동일하게: "주소(사업장)"→"본사주소", "실제주소1"→"설치주소"(hint "사업장과 다를 때만" 제거 또는 "본사와 다르면 입력"), "실제주소2"→"주소2".

- [ ] **Step 6: '동일' 체크박스 + 라이브 동기화 (CompanyForm.tsx)**

`useWatch`로 `address`·`address_actual1` 구독. 로컬 상태 `sameAsInstall`(초기: `deriveSameAsHq(company.address, company.address_actual1)`; create 모드는 true). 설치주소 Field 위/옆에 체크박스:

```tsx
import { deriveSameAsHq } from "@/lib/customers/install-address";
// ...
const hqAddr = useWatch({ control, name: "address" }) as string;
const [sameAsHq, setSameAsHq] = useState(
  props.mode === "edit" ? deriveSameAsHq(props.company.address ?? "", props.company.address_actual1 ?? "") : true,
);
// 동일 체크 중이면 본사주소 변경을 설치주소에 라이브 반영.
useEffect(() => {
  if (sameAsHq) setValue("address_actual1", hqAddr ?? "", { shouldDirty: true });
}, [sameAsHq, hqAddr, setValue]);
```

설치주소 입력은 `disabled={sameAsHq}`. 체크박스:

```tsx
<label className="flex items-center gap-2 text-small text-muted">
  <input type="checkbox" checked={sameAsHq} onChange={(e) => setSameAsHq(e.target.checked)} />
  설치주소가 본사주소와 동일
</label>
```

⚠️ 설치주소 `register("address_actual1")` 입력에 `disabled={sameAsHq}` 추가. 체크 해제 시 사용자가 직접 편집.

- [ ] **Step 7: 상세 화면 라벨 통일**

`grep -rn "실제주소" apps/web/src`로 고객 상세 등에서 라벨 표시 지점을 찾아 "설치주소"/"주소2"로 통일(있을 때만).

- [ ] **Step 8: 게이트**

Run: `pnpm --filter web test -- install-address.test.ts && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: PASS(lint 0 errors)

- [ ] **Step 9: 커밋**

```bash
git add apps/web/src/lib/customers/install-address.ts apps/web/src/lib/customers/install-address.test.ts apps/web/src/app/admin/customers/_components/CompanyForm.tsx
git commit -m "feat: 고객 폼 본사/설치주소 라벨 + 동일 라이브 동기화 체크박스"
```

---

### Task 3: DB — release_orders.hq_address 컬럼 + 발행 동결 + RPC 10-arg

**Files:**
- Create: `supabase/migrations/20260713130000_release_order_hq_address.sql`
- Create: `supabase/rollback/20260713130000_release_order_hq_address_down.sql`
- Test: `packages/db-tests/src/release_order_hq_address.test.ts`

**Interfaces:**
- Produces: `release_orders.hq_address text`(nullable), 발행 동결 트리거에 hq_address 포함, RPC `upsert_release_order`가 `p_hq_address` 인자를 받아 저장.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260713130000_release_order_hq_address.sql`:

```sql
-- 출고의뢰서 본사주소 스냅샷 컬럼. 설치주소(install_address)와 별개로 발행 시점 본사주소를 보존.
-- PDF에는 설치주소만 표시(워커 무변경). 본사주소는 폼/이력 보존·역반영용.
alter table public.release_orders add column if not exists hq_address text;

-- 발행본 동결 트리거 재정의 — hq_address도 issued 동결 목록에 추가(버전관리 트리거 최신본 기준).
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.version := old.version; -- 버전 불변
  if old.status = 'issued' then
    if new.application_id is distinct from old.application_id
       or new.quote_id is distinct from old.quote_id
       or new.device_kind is distinct from old.device_kind
       or new.status is distinct from old.status
       or new.company is distinct from old.company
       or new.contact_phone is distinct from old.contact_phone
       or new.hq_address is distinct from old.hq_address
       or new.install_address is distinct from old.install_address
       or new.install_at is distinct from old.install_at
       or new.device_name is distinct from old.device_name
       or new.details is distinct from old.details
       or new.created_by is distinct from old.created_by then
      raise exception '발행된 출고의뢰서 버전은 수정할 수 없습니다(새 버전으로 저장됩니다)';
    end if;
  end if;
  return new;
end; $$;

-- RPC 재정의 — p_hq_address 추가(10-arg). 기존 9-arg 오버로드 drop 후 통합.
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text);

create or replace function public.upsert_release_order(
  p_application_id uuid,
  p_device_kind text,
  p_details jsonb,
  p_company text default null,
  p_contact_phone text default null,
  p_hq_address text default null,       -- 본사주소(신규) — 빈 값이면 의뢰주소 폴백
  p_install_address text default null,  -- 설치주소 — 빈 값이면 의뢰주소 폴백
  p_device_name text default null,
  p_install_date text default null,
  p_install_time text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications;
  v_quote public.quotes;
  v_install_at timestamptz;
  v_device_name text;
  v_company text;
  v_phone text;
  v_hq text;
  v_address text;
  v_latest public.release_orders;
  v_row public.release_orders;
begin
  if not public.has_permission(v_uid, 'release_orders.write') then
    raise exception '출고의뢰서 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if p_device_kind is null or p_device_kind not in ('printer', 'cutter') then
    raise exception 'device_kind는 printer 또는 cutter여야 합니다: %', p_device_kind;
  end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'details는 JSON 객체여야 합니다';
  end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 20000 then
    raise exception 'details가 너무 큽니다(최대 20KB)';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception '존재하지 않는 의뢰입니다: %', p_application_id;
  end if;
  if not (v_app.assignee_id = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 의뢰에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quote from public.quotes
    where application_id = p_application_id and status = 'issued'
    order by version desc limit 1;

  if nullif(btrim(coalesce(p_install_date, '')), '') is not null then
    v_install_at := (p_install_date || ' ' || coalesce(nullif(btrim(p_install_time), ''), '00:00'))::timestamp
      at time zone 'Asia/Seoul';
  elsif v_quote.delivery_date is not null then
    v_install_at := (v_quote.delivery_date::text || ' ' || coalesce(v_quote.delivery_time::text, '00:00:00'))::timestamp
      at time zone 'Asia/Seoul';
  end if;

  v_device_name := coalesce(
    nullif(btrim(coalesce(p_device_name, '')), ''),
    nullif(btrim(coalesce(v_quote.items -> 0 ->> 'name', '')), '')
  );

  v_company := left(coalesce(nullif(btrim(coalesce(p_company, '')), ''), v_app.company), 200);
  v_phone := left(coalesce(nullif(btrim(coalesce(p_contact_phone, '')), ''), v_app.phone), 50);
  v_hq := left(coalesce(nullif(btrim(coalesce(p_hq_address, '')), ''), v_app.address), 1000);
  v_address := left(coalesce(nullif(btrim(coalesce(p_install_address, '')), ''), v_app.address), 1000);

  select * into v_latest from public.release_orders
    where application_id = p_application_id
    order by version desc limit 1;

  if found and v_latest.status = 'draft' then
    update public.release_orders set
      quote_id = v_quote.id, device_kind = p_device_kind,
      company = v_company, contact_phone = v_phone,
      hq_address = v_hq, install_address = v_address,
      install_at = v_install_at, device_name = v_device_name,
      details = coalesce(p_details, '{}'::jsonb)
    where id = v_latest.id
    returning * into v_row;
  else
    insert into public.release_orders (
      application_id, version, quote_id, device_kind, status,
      company, contact_phone, hq_address, install_address, install_at, device_name, details, created_by
    )
    values (
      p_application_id, coalesce(v_latest.version, 0) + 1, v_quote.id, p_device_kind, 'draft',
      v_company, v_phone, v_hq, v_address, v_install_at, v_device_name,
      coalesce(p_details, '{}'::jsonb), v_uid
    )
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text) to authenticated;
```

⚠️ **인자 순서 주의**: 신규 `p_hq_address`를 `p_contact_phone` 다음·`p_install_address` 앞에 넣었다(위 시그니처 순서 고정). 액션(Task 4)이 반드시 이 순서/이름으로 호출해야 한다.

`supabase/rollback/20260713130000_release_order_hq_address_down.sql`:

```sql
-- 롤백 — 10-arg RPC drop 후 9-arg 재생성은 원본 마이그(20260630120000) 참조. 컬럼·트리거 원복.
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text);
alter table public.release_orders drop column if exists hq_address;
-- 동결 트리거는 20260626160000 본문으로 수동 원복 필요(hq_address 라인 제거).
```

- [ ] **Step 2: db-test 작성**

`packages/db-tests/src/release_order_hq_address.test.ts` — 기존 release order db-test(있으면)·`helpers.ts` 패턴 따름. 케이스:
- 관리자 role로 `upsert_release_order(..., p_hq_address:=본사, p_install_address:=설치, ...)` 호출 → 반환 jsonb에 `hq_address=본사`·`install_address=설치`.
- p_hq_address 빈 값 → `hq_address`가 applications.address로 폴백.
- 발행(issue) 후 `update release_orders set hq_address=...` 시도 → 동결 예외.

> 실제 `helpers.ts` 시그니처와 기존 release order 테스트를 읽고 seed(applications·quotes·release_orders 준비) 방식을 맞춘다.

- [ ] **Step 3: 로컬 검증**

```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/db-tests exec vitest run src/release_order_hq_address.test.ts
```
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260713130000_release_order_hq_address.sql supabase/rollback/20260713130000_release_order_hq_address_down.sql packages/db-tests/src/release_order_hq_address.test.ts
git commit -m "feat: 출고의뢰서 hq_address 컬럼·발행동결·RPC 10-arg"
```

---

### Task 4: release-orders 액션 + 로더 — hqAddress 전달·검증·프리필·역반영 매핑

**Files:**
- Modify: `apps/web/src/lib/release-orders/actions.ts`
- Modify: `apps/web/src/lib/release-orders/queries.ts`

**Interfaces:**
- Consumes: RPC 10-arg(Task 3), shared 프리필 hq_address(Task 1).
- Produces: `ReleaseOrderFields`에 `hqAddress: string` 추가; 로더가 `hqAddress` 프리필 제공(`ReleaseOrderFormData.hqAddress`).

- [ ] **Step 1: actions.ts — ReleaseOrderFields + 검증 + RPC 인자 + reflect 매핑**

`ReleaseOrderFields` 타입(약 14-21행)에 `hqAddress: string;` 추가(installAddress 앞).

`fieldsParsed` zod(약 82-91행)에 추가:
```ts
      hqAddress: z.string().trim().max(1000, "본사주소는 1000자 이내").default(""),
```

RPC 호출(약 98-108행)에 `p_hq_address: f.hqAddress` 추가(순서: p_contact_phone 다음, p_install_address 앞 — Task 3 시그니처와 일치):
```ts
    p_company: f.company,
    p_contact_phone: f.contactPhone,
    p_hq_address: f.hqAddress,
    p_install_address: f.installAddress,
    p_device_name: f.deviceName,
```

reflect 매핑(약 129-132행) 수정 — 본사→address, 설치→address_actual1:
```ts
    const { error: upErr } = await supabase
      .from("companies")
      .update({
        name: f.company,
        phone: f.contactPhone || null,
        address: f.hqAddress || null,            // 본사주소
        address_actual1: f.installAddress || null, // 설치주소
      })
      .eq("id", companyId);
```

- [ ] **Step 2: queries.ts — 연결 고객 주소 조회 + hqAddress 프리필**

`loadReleaseOrderForForm`:
- applications SELECT(약 70-74행)에 `company_id` 추가: `.select("company, phone, address, fields, company_id")`.
- 연결 고객 있으면 주소 조회:
```ts
  const companyId = (app as { company_id?: string | null }).company_id ?? null;
  let companyAddr: { address: string | null; address_actual1: string | null } | null = null;
  if (companyId) {
    const { data: co } = await supabase
      .from("companies").select("address, address_actual1").eq("id", companyId).maybeSingle();
    companyAddr = (co as { address: string | null; address_actual1: string | null } | null) ?? null;
  }
```
- `buildReleaseOrderPrefill({ application: {...}, company: companyAddr, quote, deviceKind })`로 company 전달.
- `ReleaseOrderFormData`에 `hqAddress: string` 필드 추가(타입 정의 약 7-24행).
- 반환부(약 141-154행)에 `hqAddress: ro?.hq_address ?? prefill.hq_address`. 단 SELECT에 `hq_address` 추가 필요: 출고의뢰서 rows SELECT(약 89행)에 `hq_address` 컬럼 추가 + allRows 타입에 `hq_address: string | null`.

- [ ] **Step 3: 게이트**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS(0 errors)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/release-orders/actions.ts apps/web/src/lib/release-orders/queries.ts
git commit -m "feat: 출고의뢰서 액션·로더 본사주소(hqAddress) 전달·프리필·역반영 매핑"
```

---

### Task 5: ReleaseOrderForm UI — 본사주소 필드 + 동일 체크박스

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/_components/ReleaseOrderForm.tsx`
- Modify: 폼을 렌더하는 페이지(로더의 `hqAddress`를 `initial`로 내려주는 곳 — `initial` prop 구성부)

**Interfaces:**
- Consumes: `ReleaseOrderFormData.hqAddress`(Task 4), `deriveSameAsHq`(Task 2).

- [ ] **Step 1: Initial 타입 + 렌더 페이지에서 hqAddress 전달**

`Initial` 타입(약 13-20행)에 `hqAddress: string;` 추가. 폼을 렌더하는 서버 컴포넌트(loadReleaseOrderForForm 결과로 `initial`을 구성하는 page.tsx)에서 `hqAddress: data.hqAddress` 전달. (grep `installAddress:` in `apps/web/src/app/admin/applications/[id]`로 initial 구성부 확인.)

- [ ] **Step 2: 본사주소 state + 동일 체크박스 + 라이브 동기화**

```tsx
import { deriveSameAsHq } from "@/lib/customers/install-address";
// state
const [hqAddress, setHqAddress] = useState(initial.hqAddress);
const [sameAsHq, setSameAsHq] = useState(deriveSameAsHq(initial.hqAddress, initial.installAddress));
// 동일 체크 중이면 본사주소를 설치주소에 라이브 반영
useEffect(() => {
  if (sameAsHq) setInstallAddress(hqAddress);
}, [sameAsHq, hqAddress]);
```

고객정보 섹션(약 259-261행, "설치 주소" TextField 위)에 본사주소 필드 + 체크박스 추가:
```tsx
<div className="sm:col-span-2">
  <TextField label="본사주소" value={hqAddress} onChange={setHqAddress} disabled={locked} placeholder="본사주소" />
</div>
<div className="sm:col-span-2 flex items-center gap-2">
  <TextField label="설치 주소" value={installAddress} onChange={setInstallAddress} disabled={locked || sameAsHq} placeholder="설치 주소" />
</div>
<label className="flex items-center gap-2 text-small text-text">
  <input type="checkbox" checked={sameAsHq} onChange={(e) => setSameAsHq(e.target.checked)} disabled={locked} className="size-4 accent-accent" />
  <span>설치주소가 본사주소와 동일</span>
</label>
```
(grid 배치는 기존 sm:grid-cols-3 흐름에 맞춰 조정 — 본사주소/설치주소 각 col-span-2, 체크박스 한 줄.)

- [ ] **Step 3: save()에 hqAddress 전달**

`save()`(약 164-186행) `saveReleaseOrderAction` 호출 fields에 `hqAddress` 추가:
```ts
      {
        company,
        contactPhone,
        hqAddress,
        installAddress,
        deviceName,
        installDate: installDateIso,
        installTime: installDateIso ? installTime || null : null,
      },
```

- [ ] **Step 4: 게이트**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: PASS(0 errors)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/applications
git commit -m "feat: 출고의뢰서 폼 본사주소 필드 + 동일 체크박스"
```

---

### Task 6: e2e + PDF 시각검증

**Files:**
- Modify: `apps/web/e2e/customers.spec.ts`(주소 라벨 변경 반영 — 기존 테스트가 "실제주소"/"주소(사업장)" 라벨을 쓰면 갱신)
- Modify/Create: `apps/web/e2e/release-orders.spec.ts`(본사·설치 입력·동일 체크·저장)
- 워커 PDF 시각검증: 기존 `_render-sample`/하니스로 렌더 → Read 대조(설치주소만 표시).

**Interfaces:**
- Consumes: 실제 폼·RPC(로컬 db reset 반영).

- [ ] **Step 1: 기존 e2e 라벨 회귀 점검·수정**

`grep -rn "주소(사업장)\|실제주소\|설치 주소\|본사주소" apps/web/e2e`로 라벨 의존 테스트 찾기. 라벨 변경(본사주소·설치주소·주소2)에 맞춰 `getByLabel` 갱신. (Task 2에서 `주소(사업장)` 라벨을 쓰는 customers.spec의 고객 등록/수정 흐름 확인.)

- [ ] **Step 2: 출고의뢰서 e2e — 본사·설치 입력 + 동일 체크**

`release-orders.spec.ts`에 케이스 추가(기존 스타일·시드 방식 따름):
```ts
test("본사주소 입력 + 동일 체크 → 설치주소 자동 동기화 + 저장", async ({ page }) => {
  // 의뢰 → 출고의뢰서 폼 진입(기존 spec 진입 경로 재사용)
  await page.getByLabel("본사주소").fill("서울 본사");
  await page.getByLabel("설치주소가 본사주소와 동일").check();
  await expect(page.getByLabel("설치 주소")).toHaveValue("서울 본사"); // 동기화
  await expect(page.getByLabel("설치 주소")).toBeDisabled();
  await page.getByTestId("release-save").click();
  await expect(page.getByTestId("release-feedback")).toContainText(/저장/);
});
```

- [ ] **Step 3: 로컬 e2e 실행**

```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter web test:e2e -- customers.spec.ts release-orders.spec.ts
```
Expected: PASS

- [ ] **Step 4: PDF 시각검증(설치주소만)**

워커 하니스로 hq_address·install_address가 다른 출고의뢰서를 렌더 → 생성 PDF를 **Read 도구로** 열어 "설치 주소"에 설치주소가 찍히고 본사주소는 없는지 육안 대조. (⚠️ PNG/PDF를 cat/grep 금지 — Read 도구만.) 워커 코드 무변경이라 회귀 없음 확인 목적.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/e2e
git commit -m "test(e2e): 고객 주소 라벨·출고의뢰서 본사/설치 입력·동일 체크"
```

---

## 최종 게이트 (머지 전)

```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter @jhtechsaas/db-tests test:rls   # 최소 release_order_hq_address + 무회귀
pnpm --filter web test:e2e
pnpm --filter @jhtechsaas/worker test
pnpm --filter web build
```
모두 GREEN + `as any` 0. 머지 후 `supabase db push`(hq_address 마이그·RPC 10-arg).

## Self-Review (스펙 대비 커버리지)

- 고객 폼 라벨(본사주소·설치주소·주소2) → Task 2.
- 고객 폼 동일 라이브 동기화 → Task 2.
- 출고의뢰서 hq_address 저장(컬럼·RPC·동결) → Task 3.
- 출고의뢰서 본사·설치 입력 + 동일 체크 → Task 5.
- 프리필(company→app 폴백) → Task 1(shared)·Task 4(loader).
- 역반영 매핑(본사→address·설치→address_actual1) → Task 4.
- PDF 설치주소만 → 워커 무변경, Task 6 시각검증.
- 기존 테스트 회귀(라벨·RPC arg) → Task 6 Step 1, Task 4.
