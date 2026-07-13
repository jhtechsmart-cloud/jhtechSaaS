# 고객 등록 필수항목 강화 + 중복 방지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 등록/수정에서 필수항목(업체명·사업자번호·대표자·연락처·주소)을 강화하고, 사업자번호 및 회사명+연락처 기반 중복을 실시간 경고+저장 시 서버 차단으로 막는다.

**Architecture:** 접근 A(앱 레이어 중심). 검증은 Zod 스키마 + 서버액션 재검증 + 실시간 조회로 강제. 중복 조회는 RLS를 우회해 전 고객을 검사하는 `SECURITY DEFINER` RPC(`check_company_duplicate`)로 수행(다른 영업 담당 고객과의 중복도 잡기 위함). DB에는 컬럼 `NOT NULL`을 추가하지 않고 사업자번호 부분 UNIQUE 인덱스(기존)만 유지·확인한다.

**Tech Stack:** Next.js(App Router, RSC + server actions), react-hook-form + zodResolver, Zod4, Supabase(Postgres, RLS, SECURITY DEFINER RPC), Vitest(단위), Playwright(e2e), `@jhtechsaas/db-tests`(pg set role RLS).

## Global Constraints

- 단일테넌트 — `tenant_id` 없음. RLS는 capability(`customers.edit`/`customers.view_all`) + `assignee_id` 스코프.
- 새 SQL 함수는 `SECURITY DEFINER SET search_path = ''`, `revoke all ... from public, anon` 후 필요한 롤에만 `grant execute`.
- 마이그레이션은 `supabase/migrations/`에, 롤백은 **`supabase/rollback/`(단수)** 에 `<timestamp>_<name>_down.sql`.
- 코드 주석은 한국어. `as any` 금지.
- 외부/RPC 응답은 Zod로 형태 검증 후 사용.
- 게이트(머지 전 전부 통과): `pnpm --filter @jhtechsaas/shared test` · `web test` · `web typecheck` · `lint`(0) · `@jhtechsaas/db-tests test:rls` · `web test:e2e` · `build`.
- db-tests·e2e는 **클린 `supabase db reset` + `bash supabase/seed/seed-local.sh`** 후에만.
- 원격 DB 반영은 머지 후 `supabase db push`(RPC 마이그 포함).
- 필수 판정·정규화 등 순수 로직은 별도 파일 + 단위테스트(컴포넌트/액션에서 위임).

---

### Task 1: 프로덕션 biz_no UNIQUE 인덱스 확인 (+ 없으면 인덱스 마이그레이션)

중복 원인이 "사업자번호 공란"인지 "prod 인덱스 미적용"인지 확정한다. 코드 작업 전 진단.

**Files:**
- (조건부) Create: `supabase/migrations/20260713120000_companies_biz_no_unique_ensure.sql`
- (조건부) Create: `supabase/rollback/20260713120000_companies_biz_no_unique_ensure_down.sql`

**Interfaces:**
- Produces: prod에 `companies_biz_no_unique` 인덱스가 존재함을 보장(이후 태스크가 이 유일성에 의존).

- [ ] **Step 1: prod 인덱스·중복 실측**

Seonje님께 아래 SQL을 prod에서 실행 요청(또는 `supabase db` 연결 후 실행). 결과를 계획 실행 로그에 남긴다.

```sql
-- (a) 인덱스 존재?
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='companies' and indexname='companies_biz_no_unique';
-- (b) 동일 사업자번호 중복 행?
select biz_no, count(*) from public.companies
where biz_no is not null group by biz_no having count(*) > 1;
-- (c) 사업자번호 공란 고객 수?
select count(*) from public.companies where biz_no is null;
```

- [ ] **Step 2: 분기 판단**

- (a)가 1행 반환 + (b)가 0행 → 인덱스 정상. 원인은 "공란 등록"(가설 ①). **이 태스크의 마이그레이션 파일은 만들지 않는다.** Task 2로.
- (a)가 0행(인덱스 없음) → prod 미적용(가설 ②). Step 3 진행.
- (b)가 1행 이상 → 실제 중복 10자리 존재. 인덱스 추가 전 **중복부터 수동 정리 필요**(Task 8 리포트로 식별 → Seonje님이 정리) 후 Step 3.

- [ ] **Step 3(조건부): 멱등 인덱스 보장 마이그레이션 작성**

`supabase/migrations/20260713120000_companies_biz_no_unique_ensure.sql`:

```sql
-- companies.biz_no 부분 UNIQUE 인덱스 보장(prod 미적용 대비 멱등). biz_no는 CHECK로 10자리 숫자만 저장됨.
create unique index if not exists companies_biz_no_unique
  on public.companies (biz_no) where biz_no is not null;
```

`supabase/rollback/20260713120000_companies_biz_no_unique_ensure_down.sql`:

```sql
drop index if exists public.companies_biz_no_unique;
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260713120000_companies_biz_no_unique_ensure.sql supabase/rollback/20260713120000_companies_biz_no_unique_ensure_down.sql
git commit -m "fix: companies 사업자번호 부분 UNIQUE 인덱스 멱등 보장(prod 미적용 대비)"
```

> (a)가 정상이면 이 태스크는 커밋 없이 종료(진단만).

---

### Task 2: 순수 검증 유틸 (연락처 최소1·회사명 정규화·이메일 형식)

**Files:**
- Create: `apps/web/src/lib/customers/validation.ts`
- Test: `apps/web/src/lib/customers/validation.test.ts`

**Interfaces:**
- Produces:
  - `hasAnyContact(v: { mobile?: string; phone1?: string; phone?: string }): boolean`
  - `normalizeCompanyName(name: string): string`  // 공백 제거 + 소문자
  - `isOptionalEmailValid(email: string): boolean`  // 빈 값 허용, 값 있으면 형식 검증

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/customers/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasAnyContact, normalizeCompanyName, isOptionalEmailValid } from "./validation";

describe("hasAnyContact", () => {
  it("셋 다 비면 false", () => {
    expect(hasAnyContact({ mobile: "", phone1: "", phone: "" })).toBe(false);
  });
  it("공백만 있어도 false", () => {
    expect(hasAnyContact({ mobile: "   ", phone1: "", phone: "" })).toBe(false);
  });
  it("하나라도 값 있으면 true", () => {
    expect(hasAnyContact({ mobile: "010-1234-5678", phone1: "", phone: "" })).toBe(true);
    expect(hasAnyContact({ phone1: "02-123-4567" })).toBe(true);
  });
});

describe("normalizeCompanyName", () => {
  it("공백 제거 + 소문자", () => {
    expect(normalizeCompanyName(" 재현테크 ")).toBe("재현테크");
    expect(normalizeCompanyName("ABC Co")).toBe("abcco");
  });
});

describe("isOptionalEmailValid", () => {
  it("빈 값 허용", () => expect(isOptionalEmailValid("")).toBe(true));
  it("형식 맞으면 true", () => expect(isOptionalEmailValid("a@b.co.kr")).toBe(true));
  it("형식 틀리면 false", () => {
    expect(isOptionalEmailValid("foo@")).toBe(false);
    expect(isOptionalEmailValid("foo")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- validation.test.ts`
Expected: FAIL(모듈 없음)

- [ ] **Step 3: 구현**

`apps/web/src/lib/customers/validation.ts`:

```ts
import { z } from "zod";

// 연락처 최소 1개 — 휴대폰·전화1·대표연락처 중 하나라도 값(공백 제외)이 있으면 true.
export function hasAnyContact(v: { mobile?: string; phone1?: string; phone?: string }): boolean {
  return [v.mobile, v.phone1, v.phone].some((s) => (s ?? "").trim() !== "");
}

// 회사명 정규화(중복 비교용) — 공백 제거 + 소문자. SQL check_company_duplicate와 규칙 일치.
export function normalizeCompanyName(name: string): string {
  return name.replace(/\s/g, "").toLowerCase();
}

// 선택 이메일 — 빈 값 허용, 값이 있으면 형식 검증.
const emailSchema = z.string().email();
export function isOptionalEmailValid(email: string): boolean {
  const t = email.trim();
  return t === "" || emailSchema.safeParse(t).success;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- validation.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/customers/validation.ts apps/web/src/lib/customers/validation.test.ts
git commit -m "feat: 고객 검증 순수유틸(연락처 최소1·회사명 정규화·이메일 형식)"
```

---

### Task 3: companyFormSchema 필수항목 강화 + '사업자번호 없음' 예외

**Files:**
- Modify: `apps/web/src/lib/customers/schema.ts`
- Test: `apps/web/src/lib/customers/schema.test.ts` (신규)

**Interfaces:**
- Consumes: `validateBizNo`(shared), `hasAnyContact`/`isOptionalEmailValid`(Task 2).
- Produces: `companyFormSchema`에 필드 `biz_no_none: boolean` 추가, `CompanyFormValues`에 반영. 필수: name·biz_no(none이면 면제)·ceo·address·연락처(최소1). email은 값 있으면 형식.

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/customers/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { companyFormSchema } from "./schema";

// 유효 최소 입력 헬퍼(필수만 채움)
const base = {
  name: "재현테크", biz_no: "123-45-67890", biz_no_none: false, ceo: "홍길동",
  mobile: "010-1234-5678", phone1: "", phone: "", address: "서울시 …",
  email: "", manager: "", manager_title: "", phone2: "", fax: "",
  biz_type: "", biz_item: "", ledger_name: "", address_actual1: "",
  address_actual2: "", note: "", assignee_id: "", equipment: [],
};
// 주: biz_no는 체크섬 유효값으로 교체해 테스트(아래 valid 상수).
const validBiz = "220-81-62517"; // 예시 — 실제 체크섬 통과값으로 대체

describe("companyFormSchema 필수", () => {
  it("필수 다 채우면 통과", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz }).success).toBe(true);
  });
  it("업체명 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, name: "" }).success).toBe(false);
  });
  it("대표자 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, ceo: "" }).success).toBe(false);
  });
  it("주소 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, address: "" }).success).toBe(false);
  });
  it("연락처 셋 다 비면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, mobile: "", phone1: "", phone: "" }).success).toBe(false);
  });
  it("사업자번호 없이 none 미체크면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "", biz_no_none: false }).success).toBe(false);
  });
  it("none 체크 + 사업자번호 공란이면 통과", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "", biz_no_none: true }).success).toBe(true);
  });
  it("사업자번호 체크섬 틀리면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "123-45-67891" }).success).toBe(false);
  });
  it("이메일 형식 틀리면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, email: "foo@" }).success).toBe(false);
  });
});
```

> 실행 전 `validBiz`를 실제 체크섬 통과 사업자번호로 교체(테스트용 임의값 하나를 `validateBizNo`로 확인해 확정).

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test -- schema.test.ts`
Expected: FAIL(현 스키마는 name만 필수)

- [ ] **Step 3: 스키마 수정**

`apps/web/src/lib/customers/schema.ts` — `companyFormSchema`를 아래로 교체(기존 필드 유지 + 필수화 + refine):

```ts
import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";
import { hasAnyContact, isOptionalEmailValid } from "./validation";

// (companyEquipmentRowSchema는 기존 그대로 유지)

// 고객(업체) 폼 스키마 — 클라이언트(react-hook-form)와 서버액션 재검증이 공유.
// 필수: name·biz_no(단 '사업자번호 없음' 체크 시 면제)·ceo·address·연락처(최소1).
export const companyFormSchema = z
  .object({
    name: z.string().trim().min(1, "업체명을 입력하세요").max(200, "200자 이내"),
    biz_no: z.string().trim().max(20),
    biz_no_none: z.boolean().default(false), // 폼 전용 — DB 미저장(사업자번호 없는 고객 예외)
    ceo: z.string().trim().min(1, "대표자를 입력하세요").max(200),
    manager: z.string().trim().max(200, "200자 이내").default(""),
    manager_title: z.string().trim().max(100, "100자 이내").default(""),
    phone: z.string().trim().max(50).default(""),
    email: z.string().trim().max(200).default(""),
    address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내"),
    biz_type: z.string().trim().max(200, "200자 이내").default(""),
    biz_item: z.string().trim().max(200, "200자 이내").default(""),
    ledger_name: z.string().trim().max(200, "200자 이내").default(""),
    phone1: z.string().trim().max(50, "50자 이내").default(""),
    phone2: z.string().trim().max(50, "50자 이내").default(""),
    fax: z.string().trim().max(50, "50자 이내").default(""),
    mobile: z.string().trim().max(50, "50자 이내").default(""),
    address_actual1: z.string().trim().max(500, "500자 이내").default(""),
    address_actual2: z.string().trim().max(500, "500자 이내").default(""),
    note: z.string().trim().max(2000).default(""),
    assignee_id: z.string().default(""),
    equipment: z.array(companyEquipmentRowSchema).default([]),
  })
  // 사업자번호: none 체크면 공란 요구, 아니면 체크섬 유효 필수.
  .refine(
    (v) => (v.biz_no_none ? v.biz_no.trim() === "" : validateBizNo(v.biz_no)),
    { message: "사업자등록번호를 입력하세요(또는 '사업자번호 없음' 체크)", path: ["biz_no"] },
  )
  // 연락처 최소 1개.
  .refine((v) => hasAnyContact(v), {
    message: "연락처(휴대폰·전화1·대표연락처)를 하나 이상 입력하세요",
    path: ["mobile"],
  })
  // 이메일 형식(값 있을 때만).
  .refine((v) => isOptionalEmailValid(v.email), {
    message: "이메일 형식이 올바르지 않습니다",
    path: ["email"],
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test -- schema.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 web 단위테스트 실행 → 회귀 파악**

Run: `pnpm --filter web test`
Expected: 스키마 강화로 실패하는 기존 테스트(예: `customer-prefill.test.ts` 등에서 필수 누락 시)를 식별. 실패가 있으면 해당 테스트가 최소 필수(ceo·address·연락처·biz_no|none)를 채우도록 수정. `biz_no_none` 필드 추가로 인한 타입 오류도 여기서 해결.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/customers/schema.ts apps/web/src/lib/customers/schema.test.ts
git commit -m "feat: 고객 폼 필수항목 강화(사업자번호·대표자·주소·연락처)+이메일 형식+없음 예외"
```

---

### Task 4: check_company_duplicate RPC (RLS 우회 중복 조회)

**Files:**
- Create: `supabase/migrations/20260713120100_check_company_duplicate.sql`
- Create: `supabase/rollback/20260713120100_check_company_duplicate_down.sql`
- Test: `packages/db-tests/src/check_company_duplicate.test.ts`

**Interfaces:**
- Produces: RPC `check_company_duplicate(p_biz_no text, p_name text, p_phone text, p_exclude_id uuid) returns jsonb` — 매칭 시 `{company_id, name, ceo, match}`(match ∈ biz_no|name_phone), 없으면 null. `authenticated`만 실행.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260713120100_check_company_duplicate.sql`:

```sql
-- 고객 등록/수정 시 중복 조회 RPC. RLS를 우회(SECURITY DEFINER)해 다른 영업 담당 고객과의
-- 중복까지 검사한다. 최소 필드만 반환. 우선순위: ① 사업자번호 정확일치 ② 회사명(공백제거·소문자)+전화(숫자) 동시일치.
create or replace function public.check_company_duplicate(
  p_biz_no text, p_name text, p_phone text, p_exclude_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_name text := lower(regexp_replace(coalesce(p_name, ''), '\s', '', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_row public.companies%rowtype;
begin
  -- ① 사업자번호 정확 일치(10자리일 때만)
  if v_biz ~ '^\d{10}$' then
    select * into v_row from public.companies
      where biz_no = v_biz and (p_exclude_id is null or id <> p_exclude_id)
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'biz_no');
    end if;
  end if;
  -- ② 회사명 + 전화 동시 일치(사업자번호 없는 중복 방지)
  if v_name <> '' and v_phone <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '\s', '', 'g')) = v_name
        and (
          regexp_replace(coalesce(mobile, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone1, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
        )
        and (p_exclude_id is null or id <> p_exclude_id)
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_phone');
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.check_company_duplicate(text, text, text, uuid) from public, anon;
grant execute on function public.check_company_duplicate(text, text, text, uuid) to authenticated;
```

`supabase/rollback/20260713120100_check_company_duplicate_down.sql`:

```sql
drop function if exists public.check_company_duplicate(text, text, text, uuid);
```

- [ ] **Step 2: db-test 작성**

`packages/db-tests/src/check_company_duplicate.test.ts`(기존 `companies.test.ts`의 seed·role 헬퍼 패턴을 따른다):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminPool, asRole, resetSeed } from "./helpers"; // helpers.ts의 실제 export에 맞춰 조정

describe("check_company_duplicate RPC", () => {
  // seed: 회사 A(biz_no 220-81-62517 정규화, mobile 010-1111-2222, name '재현테크')
  it("사업자번호 정확 일치 → biz_no 매치 반환", async () => {
    const { rows } = await adminPool.query(
      "select public.check_company_duplicate($1,$2,$3,$4) as r",
      ["2208162517", "", "", null],
    );
    expect(rows[0].r?.match).toBe("biz_no");
  });
  it("회사명+전화 일치(사업자번호 없이) → name_phone 매치", async () => {
    const { rows } = await adminPool.query(
      "select public.check_company_duplicate($1,$2,$3,$4) as r",
      ["", "재현테크", "01011112222", null],
    );
    expect(rows[0].r?.match).toBe("name_phone");
  });
  it("exclude_id로 자기 자신 제외 → null", async () => {
    // 회사 A의 id를 조회해 exclude로 넘기면 매치 없음
  });
  it("anon은 실행 불가(권한 없음)", async () => {
    await expect(asRole("anon", (c) =>
      c.query("select public.check_company_duplicate('2208162517','','',null)"),
    )).rejects.toThrow();
  });
});
```

> `helpers.ts`의 실제 시그니처(풀 생성·`set role`·seed)를 읽고 위 골격을 맞춘다. seed 회사는 테스트 내 INSERT로 준비하거나 seed-local에 이미 있으면 재사용.

- [ ] **Step 3: 로컬 DB 리셋 + 시드 + db-test 실행**

```bash
supabase db reset
bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/db-tests test:rls -- check_company_duplicate
```
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260713120100_check_company_duplicate.sql supabase/rollback/20260713120100_check_company_duplicate_down.sql packages/db-tests/src/check_company_duplicate.test.ts
git commit -m "feat: 고객 중복 조회 RPC check_company_duplicate(RLS 우회·최소필드)"
```

---

### Task 5: checkCustomerDuplicate 서버액션 + create/update 서버 재검증

**Files:**
- Modify: `apps/web/src/lib/customers/actions.ts`

**Interfaces:**
- Consumes: RPC `check_company_duplicate`(Task 4).
- Produces:
  - `checkCustomerDuplicate(input: { bizNo: string; name: string; phone: string; excludeId?: string }): Promise<DuplicateHit | null>` — 클라이언트 실시간 호출용.
  - `type DuplicateHit = { company_id: string; name: string; ceo: string | null; match: "biz_no" | "name_phone" }`
  - `createCustomer`/`updateCustomer`: 저장 직전 동일 RPC로 서버 재검증(중복이면 에러 반환).

- [ ] **Step 1: checkCustomerDuplicate 액션 추가**

`apps/web/src/lib/customers/actions.ts` — 상단 import에 필요 시 `requireCustomersEdit`(이미 있음) 사용. 파일에 추가:

```ts
export type DuplicateHit = { company_id: string; name: string; ceo: string | null; match: "biz_no" | "name_phone" };

const duplicateHitSchema = z.object({
  company_id: z.guid(),
  name: z.string(),
  ceo: z.string().nullable(),
  match: z.enum(["biz_no", "name_phone"]),
});

// 중복 조회 — 실시간 경고(클라)와 서버 재검증(create/update)이 공유하는 내부 헬퍼.
async function lookupDuplicate(
  supabase: SupabaseClient,
  input: { bizNo: string; name: string; phone: string; excludeId?: string },
): Promise<DuplicateHit | null> {
  const { data, error } = await supabase.rpc("check_company_duplicate", {
    p_biz_no: input.bizNo || "",
    p_name: input.name || "",
    p_phone: input.phone || "",
    p_exclude_id: input.excludeId ?? null,
  });
  if (error) { console.error("[customers.checkDuplicate]", error); return null; }
  if (data == null) return null;
  const parsed = duplicateHitSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// 클라이언트(CompanyForm) 실시간 중복 조회.
export async function checkCustomerDuplicate(input: {
  bizNo: string; name: string; phone: string; excludeId?: string;
}): Promise<DuplicateHit | null> {
  const access = await requireCustomersEdit();
  if (access.status === "forbidden") return null;
  const supabase = await createSupabaseServerClient();
  return lookupDuplicate(supabase, input);
}
```

- [ ] **Step 2: createCustomer 서버 재검증 추가**

`createCustomer`의 insert 직전(현재 `const supabase = await createSupabaseServerClient();` 다음)에 삽입:

```ts
  // 서버 최종 중복 차단(실시간 조회와 저장 사이 경합 방지). 대표 연락처 하나로 판정.
  const contact = v.mobile || v.phone1 || v.phone || "";
  const dup = await lookupDuplicate(supabase, { bizNo: v.biz_no, name: v.name, phone: contact });
  if (dup) return { error: `이미 등록된 업체입니다: ${dup.name}` };
```

(기존 `isUniqueViolation` catch는 백스톱으로 그대로 둔다.)

- [ ] **Step 3: updateCustomer 서버 재검증 추가(자기 제외)**

`updateCustomer`의 update 직전에 삽입:

```ts
  const contact = v.mobile || v.phone1 || v.phone || "";
  const dup = await lookupDuplicate(supabase, { bizNo: v.biz_no, name: v.name, phone: contact, excludeId: id });
  if (dup) return { error: `이미 등록된 업체입니다: ${dup.name}` };
```

- [ ] **Step 4: typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS(`SupabaseClient` 타입 이미 import됨)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/customers/actions.ts
git commit -m "feat: 고객 중복 서버 재검증 + checkCustomerDuplicate 실시간 액션"
```

---

### Task 6: CompanyForm — '없음' 체크박스·필수 표시·실시간 중복 경고·저장 잠금

**Files:**
- Modify: `apps/web/src/app/admin/customers/_components/CompanyForm.tsx`
- Modify: `apps/web/src/app/admin/customers/_components/StickyFormFooter.tsx`

**Interfaces:**
- Consumes: `checkCustomerDuplicate`, `DuplicateHit`(Task 5); `companyFormSchema` with `biz_no_none`(Task 3).
- Produces: 저장 버튼이 중복 경고 시 잠기는 UX.

- [ ] **Step 1: StickyFormFooter에 blocked prop 추가**

`StickyFormFooter.tsx`:

```ts
export function StickyFormFooter({
  dirtyLabels, pending, saveLabel, onCancel, alwaysEnabled, blocked: forceBlocked,
}: {
  dirtyLabels: string[]; pending: boolean; saveLabel: string; onCancel: () => void;
  alwaysEnabled?: boolean; blocked?: boolean; // 중복 경고 등으로 저장 강제 잠금
}) {
  const n = dirtyLabels.length;
  const blocked = (alwaysEnabled ? pending : n === 0 || pending) || !!forceBlocked;
  // ... 이하 동일. (저장/취소 disabled={blocked} 유지. 취소는 forceBlocked와 무관히 열어두려면
  //     취소 버튼 disabled를 pending으로만 두는 편이 나음 — 아래처럼 분리 권장)
```

취소 버튼은 `disabled={pending}`으로, 저장 버튼만 `disabled={blocked}`으로 분리(중복 상태에서도 취소·수정은 가능해야 함).

- [ ] **Step 2: CompanyForm — biz_no_none 기본값**

`defaultValues`에 추가:
- create 분기: `biz_no_none: false`
- edit 분기: `biz_no_none: !props.company.biz_no`(기존 사업자번호 없는 고객은 체크된 상태로 로드)

- [ ] **Step 3: '사업자번호 없음' 체크박스 + 비활성 연동**

biz_no `Field` 아래에 체크박스 추가. `useWatch`로 `biz_no_none` 구독. 체크 시 biz_no 입력 비활성 + 값 클리어:

```tsx
const bizNoNone = useWatch({ control, name: "biz_no_none" }) as boolean;
// ...
<Field label="사업자등록번호" required={!bizNoNone} hint="숫자만 입력하면 하이픈 자동" error={errors.biz_no?.message} dirty={!!dirtyFields.biz_no}>
  <input
    {...masked(register("biz_no"), maskBizNoTyping)}
    onBlur={onBizNoBlur}
    disabled={bizNoNone}
    placeholder="123-45-67890"
    className={inputCls(!!dirtyFields.biz_no, true)}
  />
</Field>
<label className="flex items-center gap-2 text-small text-muted">
  <input
    type="checkbox"
    {...register("biz_no_none")}
    onChange={(e) => {
      register("biz_no_none").onChange(e);
      if (e.target.checked) setValue("biz_no", "", { shouldDirty: true, shouldValidate: true });
    }}
  />
  사업자번호 없음(개인·미발급)
</label>
```

- [ ] **Step 4: 필수 표시 추가**

`대표자`·`주소(사업장)` Field에 `required` 추가. 연락처 그룹(휴대폰 Field)에 `error={errors.mobile?.message}`가 이미 있으므로 refine 메시지(연락처 최소1)가 휴대폰 아래에 노출됨 — `연락처` FormSectionCard `purpose`에 "(하나 이상 필수)" 문구 보강.

- [ ] **Step 5: 실시간 중복 조회(디바운스) + 경고 카드**

컴포넌트에 상태·효과 추가:

```tsx
const [dupHit, setDupHit] = useState<DuplicateHit | null>(null);
const bizNo = useWatch({ control, name: "biz_no" }) as string;
const nameVal = useWatch({ control, name: "name" }) as string;
const mobileVal = useWatch({ control, name: "mobile" }) as string;
const phone1Val = useWatch({ control, name: "phone1" }) as string;
const phoneVal = useWatch({ control, name: "phone" }) as string;

useEffect(() => {
  const contact = mobileVal || phone1Val || phoneVal || "";
  const bizDigits = bizNo.replace(/\D/g, "");
  // 조회 트리거: 사업자번호 10자리 완성 OR (없음 모드에서 회사명+연락처 채워짐)
  const canQuery = (!bizNoNone && bizDigits.length === 10) || (bizNoNone && nameVal.trim() !== "" && contact.trim() !== "");
  if (!canQuery) { setDupHit(null); return; }
  const t = setTimeout(async () => {
    const { checkCustomerDuplicate } = await import("@/lib/customers/actions");
    const hit = await checkCustomerDuplicate({
      bizNo: bizNoNone ? "" : bizNo,
      name: nameVal,
      phone: contact,
      excludeId: props.mode === "edit" ? props.id : undefined,
    });
    setDupHit(hit);
  }, 400);
  return () => clearTimeout(t);
}, [bizNo, bizNoNone, nameVal, mobileVal, phone1Val, phoneVal, props.mode, props.id]);
```

`import type { DuplicateHit } from "@/lib/customers/actions"` 상단 추가.

경고 카드(폼 상단, `registered` 배너 근처)에 렌더:

```tsx
{dupHit && (
  <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-small text-text">
    <b>이미 등록된 업체</b>: {dupHit.name}{dupHit.ceo ? ` (대표 ${dupHit.ceo})` : ""} —{" "}
    <Link href={`/admin/customers/${dupHit.company_id}`} className="underline">기존 업체 열기</Link>
    <div className="mt-0.5 text-micro text-muted">
      {dupHit.match === "biz_no" ? "같은 사업자번호" : "같은 회사명+연락처"}로 등록돼 있어 저장할 수 없습니다.
    </div>
  </div>
)}
```

- [ ] **Step 6: 저장 잠금 연동**

`StickyFormFooter`에 `blocked={!!dupHit}` 전달. `onSubmit` 진입부에도 방어:

```tsx
function onSubmit(values: CompanyFormValues) {
  if (dupHit) { setServerError(`이미 등록된 업체입니다: ${dupHit.name}`); return; }
  // ...기존 로직
}
```

- [ ] **Step 7: typecheck + lint + build**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: PASS(0 errors)

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/app/admin/customers/_components/CompanyForm.tsx apps/web/src/app/admin/customers/_components/StickyFormFooter.tsx
git commit -m "feat: 고객 폼 없음체크·필수표시·실시간 중복경고·저장잠금"
```

---

### Task 7: e2e — 필수 차단·중복 실시간+저장 차단·없음 예외·수정 자기제외

**Files:**
- Modify: `apps/web/e2e/customers.spec.ts`(기존 등록 흐름이 필수 누락으로 깨지므로 필수 채우도록 수정 + 신규 케이스 추가)
- 확인: `apps/web/e2e/manual-quote-customer-link.spec.ts` 등 고객 폼을 쓰는 다른 e2e도 필수 채우도록 수정

**Interfaces:**
- Consumes: 실제 폼(Task 6), RPC(Task 4, 로컬 db push 반영).

- [ ] **Step 1: 기존 고객 등록 e2e를 필수 충족하도록 수정**

`customers.spec.ts`에서 고객을 만드는 흐름에 대표자·주소·연락처·사업자번호(체크섬 유효값)를 채우도록 `fill` 추가. 기존에 업체명만 넣던 부분을 보강.

- [ ] **Step 2: 신규 케이스 — 필수 누락 시 저장 불가**

```ts
test("필수 누락(대표자·주소·연락처) → 저장 버튼 비활성/에러", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers/new");
  await page.getByLabel("업체명").fill("테스트상사");
  // 사업자번호만 넣고 나머지 필수 비움 → 저장 시 에러 노출
  await page.getByLabel("사업자등록번호").fill("2208162517");
  await page.getByRole("button", { name: /저장/ }).click();
  await expect(page.getByText(/대표자를 입력|주소를 입력|연락처/)).toBeVisible();
});
```

- [ ] **Step 3: 신규 케이스 — 사업자번호 중복 실시간 경고 + 저장 잠금**

seed 또는 사전 등록으로 존재하는 사업자번호를 신규 폼에 입력 → 경고 카드 노출 + 저장 버튼 disabled 확인.

```ts
test("기존 사업자번호 입력 → 실시간 경고 + 저장 잠금", async ({ page }) => {
  await login(page);
  // 1) 회사 A 먼저 등록(필수 다 채움)
  // 2) 새 폼에서 같은 사업자번호 입력
  await page.goto("/admin/customers/new");
  await page.getByLabel("사업자등록번호").fill("<A의 사업자번호>");
  await expect(page.getByText("이미 등록된 업체")).toBeVisible();
  await expect(page.getByRole("button", { name: /저장/ })).toBeDisabled();
});
```

- [ ] **Step 4: 신규 케이스 — '없음' 예외 등록 성공**

```ts
test("사업자번호 없음 체크 → 사업자번호 없이 등록 성공", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers/new");
  await page.getByLabel("업체명").fill("개인고객");
  await page.getByLabel("대표자").fill("김개인");
  await page.getByLabel("주소(사업장)").fill("부산시 …");
  await page.getByLabel("휴대폰").fill("010-9999-8888");
  await page.getByLabel("사업자번호 없음(개인·미발급)").check();
  await page.getByRole("button", { name: /저장/ }).click();
  await expect(page).toHaveURL(/\/admin\/customers\/[0-9a-f-]+\/edit/);
});
```

- [ ] **Step 5: 로컬 e2e 실행(클린 리셋+시드+db push 반영)**

```bash
supabase db reset
bash supabase/seed/seed-local.sh
pnpm --filter web test:e2e -- customers.spec.ts
```
Expected: PASS(신규 RPC는 마이그레이션이 로컬 reset에 포함되어 적용됨)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/e2e/customers.spec.ts apps/web/e2e/manual-quote-customer-link.spec.ts
git commit -m "test(e2e): 고객 필수 차단·사업자번호 중복 경고·없음 예외"
```

---

### Task 8: 기존 중복 의심 목록 리포트(읽기 전용)

**Files:**
- Create: `apps/web/src/lib/customers/duplicates.ts`(서버 쿼리)
- Create: `apps/web/src/app/admin/customers/duplicates/page.tsx`(읽기 전용 페이지)

**Interfaces:**
- Consumes: `requireCustomersViewAll`(관리자/뷰올만 접근 — 전 고객 대상).
- Produces: 사업자번호 중복군 / 사업자번호 공란 / 회사명 정규화 중복군 목록.

- [ ] **Step 1: 서버 쿼리 작성**

`apps/web/src/lib/customers/duplicates.ts`(service 계층, server-only). RLS 우회가 필요하므로 **SECURITY DEFINER RPC**로 목록을 뽑거나, `requireCustomersViewAll` 하에 authenticated 클라이언트로 조회(view_all 권한자는 RLS상 전 고객 열람 가능하므로 별도 RPC 불필요). 후자를 채택:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DupGroup = { key: string; kind: "biz_no" | "name" | "no_biz"; companies: { id: string; name: string; biz_no: string | null; ceo: string | null }[] };

// view_all 권한 전제(호출 측 가드). 전 고객을 이름/사업자번호로 그룹핑해 중복군만 반환.
export async function getDuplicateGroups(): Promise<DupGroup[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies").select("id,name,biz_no,ceo").order("name");
  if (error || !data) return [];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const byBiz = new Map<string, typeof data>();
  const byName = new Map<string, typeof data>();
  const noBiz: typeof data = [];
  for (const c of data) {
    if (c.biz_no) { const g = byBiz.get(c.biz_no) ?? []; g.push(c); byBiz.set(c.biz_no, g); }
    else noBiz.push(c);
    const nk = norm(c.name); const gn = byName.get(nk) ?? []; gn.push(c); byName.set(nk, gn);
  }
  const groups: DupGroup[] = [];
  for (const [k, g] of byBiz) if (g.length > 1) groups.push({ key: k, kind: "biz_no", companies: g });
  for (const [k, g] of byName) if (g.length > 1) groups.push({ key: k, kind: "name", companies: g });
  if (noBiz.length) groups.push({ key: "(사업자번호 없음)", kind: "no_biz", companies: noBiz });
  return groups;
}
```

- [ ] **Step 2: 페이지 작성**

`apps/web/src/app/admin/customers/duplicates/page.tsx` — `requireCustomersViewAll` 가드 후 `getDuplicateGroups()` 렌더. 각 회사는 상세로 링크. (표: 그룹 종류 · 키 · 회사 목록[이름·사업자번호·대표자·열기])

- [ ] **Step 3: typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/customers/duplicates.ts apps/web/src/app/admin/customers/duplicates/page.tsx
git commit -m "feat: 고객 중복 의심 목록 리포트 페이지(읽기전용)"
```

---

## 최종 게이트 (머지 전)

```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web test:e2e
pnpm --filter web build
```
모두 GREEN + `as any` 0 확인. 머지 후 `supabase db push`(신규 RPC·조건부 인덱스 마이그).

## Self-Review 결과(스펙 대비 커버리지)

- 필수항목(업체명·사업자번호·대표자·연락처·주소) → Task 3.
- '사업자번호 없음' 예외 → Task 3(스키마)·Task 6(UI).
- 실시간 경고 + 저장 차단 → Task 4(RPC)·5(액션)·6(UI).
- 회사명+연락처 dedup(사업자번호 없는 고객) → Task 4·5·6.
- 적용 범위(등록·수정, 수정 시 자기 제외) → Task 5·6·7.
- prod 인덱스 확인 → Task 1.
- 이메일 형식 검증 → Task 2·3.
- 기존 중복 목록 리포트 → Task 8.
- 기존 테스트 회귀(필수 강화로 깨짐) → Task 3 Step 5, Task 7 Step 1.
