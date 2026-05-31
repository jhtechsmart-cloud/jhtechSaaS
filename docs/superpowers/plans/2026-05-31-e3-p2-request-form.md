# E3 P2 견적요청 폼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 장비 상세에서 anon 고객이 견적요청 폼을 작성·제출하면 `applications` 행이 저장되고 접수번호(REQ-…)를 돌려받는 쓰기 경로를 구현한다(`quote.html` silent-fail 제거).

**Architecture:** 클라이언트 RHF+zod 폼 → `"use server"` 서버액션이 동일 zod로 재검증 → 서버 anon Supabase 클라이언트가 `submit_application(payload jsonb)` SECURITY DEFINER RPC 호출 → seq_no 반환 → `/request/success` redirect. RPC가 필요한 이유는 anon에 SELECT 정책이 없어 `INSERT…RETURNING seq_no`가 막히기 때문(DEFINER가 RLS 우회).

**Tech Stack:** Next.js 16(App Router, server actions), React 19, react-hook-form 7 + @hookform/resolvers + zod 4, Supabase(@supabase/ssr), Postgres(plpgsql), Vitest(단위·db-tests/pg), Playwright(E2E). pnpm 워크스페이스.

**설계 문서:** `docs/superpowers/specs/2026-05-31-e3-p2-request-form-design.md`

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `apps/web/src/lib/applications/schema.ts` | zod 폼 스키마 · payload 빌더 · seq_no 검증(순수) | T1 |
| `apps/web/src/lib/applications/schema.test.ts` | 위 순수로직 단위 테스트 | T1 |
| `supabase/migrations/20260531120000_submit_application.sql` | `submit_application` RPC | T2 |
| `supabase/rollback/20260531120000_submit_application_down.sql` | RPC 롤백 | T2 |
| `packages/db-tests/src/submit_application.test.ts` | RPC RLS·동작 통합 테스트 | T2 |
| `apps/web/src/app/request/actions.ts` | `submitRequest` 서버액션(RPC 호출·redirect) | T3 |
| `apps/web/src/app/request/page.tsx` | `/request` 서버컴포넌트(장비 사전선택 조회) | T4 |
| `apps/web/src/app/request/_components/RequestForm.tsx` | RHF 클라이언트 폼(표현만) | T4 |
| `apps/web/src/app/request/success/page.tsx` | 접수완료·접수번호 표시 | T5 |
| `apps/web/src/app/request/error.tsx` | `/request` 트리 에러 바운더리 | T5 |
| `apps/web/e2e/request.spec.ts` | E2E 해피패스 + 검증에러 | T6 |
| `UI-SPEC.md` | `/request`·`/request/success` 화면계약 추가 | T7 |

**선행 의존:** T3는 T1·T2, T4는 T1·T3, T6은 T2~T5에 의존. 순서대로 실행.

---

## 사전 조건 (실행 환경)

- 로컬 Supabase 기동: `supabase start` (db-tests·E2E가 `127.0.0.1:54321`/`54322` 사용).
- T2 마이그레이션 작성 후 **로컬 DB에 적용**해야 db-tests·E2E가 새 RPC를 본다: `supabase migration up` (또는 `supabase db reset`).
- 단위 테스트(web): `pnpm -C apps/web test`
- db-tests: `pnpm -C packages/db-tests test:rls` (루트 `pnpm -r test`에는 미포함 — db-tests에는 `test` 스크립트가 없고 `test:rls`만 있음)
- E2E: `pnpm -C apps/web test:e2e`

---

## Task 1: zod 스키마 · payload 빌더 · seq_no 검증 (순수)

**Files:**
- Create: `apps/web/src/lib/applications/schema.ts`
- Test: `apps/web/src/lib/applications/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/applications/schema.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import {
  requestFormSchema,
  buildSubmitPayload,
  seqNoSchema,
  type RequestFormInput,
} from "./schema";

const valid: RequestFormInput = {
  company: "재현상사",
  ceo: "홍길동",
  biz_no: "123-45-67890",
  phone: "02-1234-5678",
  email: "a@b.com",
  address: "서울시 강남구",
  requirements: "포장기 견적 부탁드립니다",
  equipment_id: "00000000-0000-0000-0000-0000000000e1",
};

describe("requestFormSchema", () => {
  test("유효 입력 통과", () => {
    expect(requestFormSchema.safeParse(valid).success).toBe(true);
  });
  test("company 누락 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, company: "" }).success).toBe(false);
  });
  test("biz_no 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, biz_no: "12" }).success).toBe(false);
  });
  test("email 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });
  test("phone 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });
  test("requirements·equipment_id는 선택", () => {
    const { requirements, equipment_id, ...core } = valid;
    expect(requestFormSchema.safeParse(core).success).toBe(true);
  });
  test("equipment_id 빈 문자열(hidden input 미선택)은 통과", () => {
    expect(requestFormSchema.safeParse({ ...valid, equipment_id: "" }).success).toBe(true);
  });
});

describe("buildSubmitPayload", () => {
  test("biz_no 하이픈 제거 + fields 구성 + equipment_name 병합", () => {
    const p = buildSubmitPayload(requestFormSchema.parse(valid), "포장기A");
    expect(p.biz_no).toBe("1234567890");
    expect(p.company).toBe("재현상사");
    expect(p.fields.requirements).toBe("포장기 견적 부탁드립니다");
    expect(p.fields.equipment_id).toBe("00000000-0000-0000-0000-0000000000e1");
    expect(p.fields.equipment_name).toBe("포장기A");
  });
  test("빈 requirements·미선택 장비는 fields에서 생략", () => {
    const input = requestFormSchema.parse({
      company: "A", ceo: "B", biz_no: "1234567890", phone: "01012345678",
      email: "a@b.com", address: "주소",
    });
    const p = buildSubmitPayload(input);
    expect(p.fields.requirements).toBeUndefined();
    expect(p.fields.equipment_id).toBeUndefined();
    expect(p.fields.equipment_name).toBeUndefined();
  });
});

describe("seqNoSchema", () => {
  test("REQ-YYYYMMDD-NNNNN 통과", () => {
    expect(seqNoSchema.safeParse("REQ-20260531-00001").success).toBe(true);
    expect(seqNoSchema.safeParse("REQ-20260531-100000").success).toBe(true);
  });
  test("형식 외 거부", () => {
    expect(seqNoSchema.safeParse("nope").success).toBe(false);
    expect(seqNoSchema.safeParse("").success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -C apps/web test -- schema.test`
Expected: FAIL — `Cannot find module './schema'`

- [ ] **Step 3: 스키마 구현**

`apps/web/src/lib/applications/schema.ts`:
```ts
import { z } from "zod";

// 견적요청 폼 — 클라이언트(react-hook-form) 검증과 서버액션 재검증이 공유.
// 코어 6필드 모두 필수(brainstorm 합의), requirements·equipment_id는 선택.
const bizNoRegex = /^\d{3}-?\d{2}-?\d{5}$/; // 사업자등록번호 10자리(하이픈 허용)
const phoneRegex = /^[0-9+\-\s]{9,20}$/;

export const requestFormSchema = z.object({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  ceo: z.string().trim().min(1, "대표자명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  biz_no: z.string().trim().regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요"),
  phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  // zod4: .email()은 deprecated지만 동작. 린트가 막으면 z.email("...")로 교체.
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다").max(200, "200자 이내로 입력하세요"),
  address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내로 입력하세요"),
  requirements: z.string().trim().max(2000, "2000자 이내로 입력하세요").optional().default(""),
  // hidden input은 미선택 시 ""를 보내므로 ""→undefined 전처리(uuid 검증 실패 방지).
  equipment_id: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().uuid().optional(),
  ),
});

export type RequestFormInput = z.infer<typeof requestFormSchema>;

export interface SubmitPayload {
  company: string;
  ceo: string;
  biz_no: string;
  phone: string;
  email: string;
  address: string;
  fields: {
    requirements?: string;
    equipment_id?: string;
    equipment_name?: string;
  };
}

// 폼 입력 → RPC payload. equipment_name은 서버액션이 equipment_public에서 조회해 합친다.
export function buildSubmitPayload(
  input: RequestFormInput,
  equipmentName?: string,
): SubmitPayload {
  const fields: SubmitPayload["fields"] = {};
  if (input.requirements) fields.requirements = input.requirements;
  if (input.equipment_id) fields.equipment_id = input.equipment_id;
  if (equipmentName) fields.equipment_name = equipmentName;
  return {
    company: input.company,
    ceo: input.ceo,
    biz_no: input.biz_no.replace(/-/g, ""), // 정규화: 하이픈 제거 → 10자리
    phone: input.phone,
    email: input.email,
    address: input.address,
    fields,
  };
}

// RPC 접수번호 응답 검증 — 외부응답 직접 신뢰 금지(CLAUDE.md).
export const seqNoSchema = z.string().regex(/^REQ-\d{8}-\d{5,}$/, "접수번호 형식 오류");
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -C apps/web test -- schema.test`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/applications/schema.ts apps/web/src/lib/applications/schema.test.ts
git commit -m "feat(web): 견적요청 zod 스키마·payload 빌더·seq_no 검증 (E3 P2)"
```

---

## Task 2: `submit_application` RPC + 마이그레이션 + db-test

**Files:**
- Create: `supabase/migrations/20260531120000_submit_application.sql`
- Create: `supabase/rollback/20260531120000_submit_application_down.sql`
- Test: `packages/db-tests/src/submit_application.test.ts`

- [ ] **Step 1: 실패하는 db-test 작성**

`packages/db-tests/src/submit_application.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// payload 헬퍼
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    company: "RPC상사",
    ceo: "홍길동",
    biz_no: "1234567890",
    phone: "0212345678",
    email: "a@b.com",
    address: "서울",
    fields: { requirements: "테스트", equipment_id: "00000000-0000-0000-0000-0000000000e1" },
    ...over,
  });

describe("submit_application RPC (E3 P2)", () => {
  test("anon EXECUTE → REQ- 접수번호 반환 + 행 저장(new·미배정·submitted_at·fields)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select public.submit_application($1::jsonb) as seq", [payload()]);
      expect(r.rows[0].seq).toMatch(/^REQ-\d{8}-\d{5,}$/);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id, submitted_at, fields, company from public.applications where company='RPC상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
      expect(row.rows[0].submitted_at).not.toBeNull();
      expect(row.rows[0].fields.requirements).toBe("테스트");
      expect(row.rows[0].fields.equipment_id).toBe("00000000-0000-0000-0000-0000000000e1");
    });
  });

  test("company 누락/공백 → 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ company: "   " })]),
      ).rejects.toThrow();
    });
  });

  test("payload의 status·assignee_id는 무시되고 new·null 강제", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [
        payload({ company: "강제상사", status: "closed", assignee_id: "00000000-0000-0000-0000-0000000000b1" }),
      ]);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id from public.applications where company='강제상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
    });
  });

  test("anon은 RPC로 저장해도 applications를 직접 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [payload({ company: "비밀상사" })]);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(0);
    });
  });

  test("다회 호출 시 seq_no 유일", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const a = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일1" })]);
      const b = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일2" })]);
      expect(a.rows[0].seq).not.toBe(b.rows[0].seq);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

먼저 로컬 Supabase 기동 확인 후:
Run: `pnpm -C packages/db-tests test:rls -- submit_application`
Expected: FAIL — `function public.submit_application(jsonb) does not exist`

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/20260531120000_submit_application.sql`:
```sql
-- E3 P2 #4 — 공개 견적요청 RPC.
-- anon은 applications INSERT는 되지만 SELECT 정책이 없어 INSERT...RETURNING seq_no가 막힌다.
-- SECURITY DEFINER(소유자=테이블 소유자 권한, RLS 우회)로 RETURNING을 가능케 해
-- 접수번호(REQ-...)를 고객에게 돌려준다. 이것이 RPC를 두는 유일한 이유다.
-- status='new'·assignee_id=null은 함수가 하드코딩 강제(payload 값 무시) → anon 위조 차단.
-- seq_no·created_at은 기존 applications_server_fields BEFORE INSERT 트리거가 재차 강제(이중 안전).
create or replace function public.submit_application(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(payload->>'company'), '');
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_seq text;
begin
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;
  -- 길이 캡(anon 남용·저장소 폭주 방지). 코어 ≤200, 주소 ≤500, 요청사항 ≤2000, fields ≤8KB.
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

  insert into public.applications
    (company, ceo, biz_no, phone, email, address, fields, status, assignee_id, submitted_at)
  values (
    v_company,
    nullif(btrim(payload->>'ceo'), ''),
    nullif(btrim(payload->>'biz_no'), ''),
    nullif(btrim(payload->>'phone'), ''),
    nullif(btrim(payload->>'email'), ''),
    nullif(btrim(payload->>'address'), ''),
    v_fields,
    'new',     -- 하드코딩 강제
    null,      -- 하드코딩 강제(미배정)
    now()
  )
  returning seq_no into v_seq;

  return v_seq;
end;
$$;

-- public 전체에서 회수 후 anon·authenticated에만 EXECUTE 부여.
revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
```

- [ ] **Step 4: 롤백 스크립트 작성**

`supabase/rollback/20260531120000_submit_application_down.sql`:
```sql
-- E3 P2 #4 롤백 — submit_application RPC 제거.
drop function if exists public.submit_application(jsonb);
```

- [ ] **Step 5: 로컬 DB에 마이그레이션 적용**

Run: `supabase migration up`
Expected: `20260531120000_submit_application` 적용 성공. (실패 시 `supabase db reset`로 전체 재적용)

- [ ] **Step 6: db-test 통과 확인**

Run: `pnpm -C packages/db-tests test:rls -- submit_application`
Expected: PASS (5 케이스)

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/20260531120000_submit_application.sql supabase/rollback/20260531120000_submit_application_down.sql packages/db-tests/src/submit_application.test.ts
git commit -m "feat(db): submit_application 공개 견적요청 RPC + 롤백 + db-test (E3 P2)"
```

---

## Task 3: `submitRequest` 서버액션

**Files:**
- Create: `apps/web/src/app/request/actions.ts`

> 서버액션은 supabase RPC를 감싸는 통합 코드라 단위테스트 대신 db-test(T2)+E2E(T6)로 커버한다(repo의 `admin/equipment/actions.ts` 선례 — 서버액션 단위테스트 없음). 순수 로직(payload·seq_no 검증)은 T1에서 단위테스트됨.

- [ ] **Step 1: 서버액션 구현**

`apps/web/src/app/request/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import {
  requestFormSchema,
  buildSubmitPayload,
  seqNoSchema,
  type RequestFormInput,
} from "@/lib/applications/schema";

export type RequestActionResult = { error: string } | null;

export async function submitRequest(
  input: RequestFormInput,
): Promise<RequestActionResult> {
  // 서버 재검증(클라 RHF는 UX용, 신뢰경계는 서버).
  const parsed = requestFormSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  // 선택장비명: equipment_public에서 조회(없거나 inactive면 무시 — preselection만 누락).
  let equipmentName: string | undefined;
  if (v.equipment_id) {
    const eq = await getPublicEquipment(v.equipment_id);
    equipmentName = eq?.name;
  }

  const payload = buildSubmitPayload(v, equipmentName);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_application", { payload });

  // silent-fail 제거: 실패는 항상 명시적 통지. 원시 DB 메시지는 로그로만(스키마 노출 방지).
  if (error) {
    console.error("[request.submit] rpc 실패", error);
    return { error: "제출에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
  const seq = seqNoSchema.safeParse(data);
  if (!seq.success) {
    console.error("[request.submit] 접수번호 형식 오류", data);
    return { error: "제출에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  // redirect는 throw로 동작 → try/catch 밖에서 호출. 성공 시 클라가 자동 이동.
  redirect(`/request/success?no=${encodeURIComponent(seq.data)}`);
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `pnpm -C apps/web typecheck`
Expected: PASS (에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/request/actions.ts
git commit -m "feat(web): submitRequest 서버액션 — RPC 호출·접수번호 검증·redirect (E3 P2)"
```

---

## Task 4: `/request` 페이지 + RequestForm

**Files:**
- Create: `apps/web/src/app/request/page.tsx`
- Create: `apps/web/src/app/request/_components/RequestForm.tsx`

- [ ] **Step 1: 서버컴포넌트 페이지 구현**

`apps/web/src/app/request/page.tsx`:
```tsx
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { RequestForm } from "./_components/RequestForm";

// Next 16: searchParams는 Promise. 잘못된/inactive id면 preselection 없이 일반 문의로 동작.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>;
}) {
  const { equipment } = await searchParams;
  let equipmentId: string | undefined;
  let equipmentName: string | undefined;
  if (equipment) {
    const eq = await getPublicEquipment(equipment);
    if (eq) {
      equipmentId = eq.id;
      equipmentName = eq.name;
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">견적 요청</h1>
      <p className="mt-2 text-small text-muted">
        요청 주시면 담당자가 확인 후 연락드립니다.
      </p>
      <RequestForm equipmentId={equipmentId} equipmentName={equipmentName} />
    </main>
  );
}
```

- [ ] **Step 2: 클라이언트 폼 구현**

`apps/web/src/app/request/_components/RequestForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestFormSchema, type RequestFormInput } from "@/lib/applications/schema";
import { submitRequest } from "../actions";

const FIELD_CLASS =
  "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

export function RequestForm({
  equipmentId,
  equipmentName,
}: {
  equipmentId?: string;
  equipmentName?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: { equipment_id: equipmentId, requirements: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await submitRequest(values);
    // 성공 시 서버액션이 redirect → 아래 도달 안 함. 실패만 처리.
    if (res?.error) setServerError(res.error);
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      {equipmentName && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-small text-muted">
          선택 장비: <span className="font-mono text-text">{equipmentName}</span>
        </div>
      )}
      <input type="hidden" {...register("equipment_id")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            회사명
            <input {...register("company")} className={FIELD_CLASS} />
          </label>
          {errors.company && <p className="text-small text-danger">{errors.company.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            대표자명
            <input {...register("ceo")} className={FIELD_CLASS} />
          </label>
          {errors.ceo && <p className="text-small text-danger">{errors.ceo.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            사업자등록번호
            <input {...register("biz_no")} inputMode="numeric" placeholder="123-45-67890" className={`${FIELD_CLASS} font-mono`} />
          </label>
          {errors.biz_no && <p className="text-small text-danger">{errors.biz_no.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            연락처
            <input {...register("phone")} inputMode="tel" placeholder="02-1234-5678" className={`${FIELD_CLASS} font-mono`} />
          </label>
          {errors.phone && <p className="text-small text-danger">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            이메일
            <input {...register("email")} type="email" placeholder="example@company.com" className={FIELD_CLASS} />
          </label>
          {errors.email && <p className="text-small text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            주소
            <input {...register("address")} className={FIELD_CLASS} />
          </label>
          {errors.address && <p className="text-small text-danger">{errors.address.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-small text-muted">
          요청사항
          <textarea {...register("requirements")} rows={4} placeholder="장비 사양·예산·납기 등" className={FIELD_CLASS} />
        </label>
        {errors.requirements && <p className="text-small text-danger">{errors.requirements.message}</p>}
      </div>

      {serverError && <p className="text-small text-danger">{serverError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-accent px-6 py-3 text-body font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "제출 중…" : "견적 요청 보내기"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: 타입체크·빌드 통과 확인**

Run: `pnpm -C apps/web typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/request/page.tsx apps/web/src/app/request/_components/RequestForm.tsx
git commit -m "feat(web): /request 견적요청 폼(RHF+zod·장비 사전선택·반응형) (E3 P2)"
```

---

## Task 5: `/request/success` 페이지 + error 바운더리

**Files:**
- Create: `apps/web/src/app/request/success/page.tsx`
- Create: `apps/web/src/app/request/error.tsx`

- [ ] **Step 1: 성공 페이지 구현**

`apps/web/src/app/request/success/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";

// no(접수번호) 없이 직접 진입하면 카탈로그로. (새로고침·북마크 안전)
export default async function RequestSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const { no } = await searchParams;
  if (!no) redirect("/equipment");

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16 text-center">
      <h1 className="text-display font-semibold text-text">견적 요청이 접수되었습니다</h1>
      <p className="mt-4 text-body text-muted">담당자가 확인 후 연락드리겠습니다.</p>
      <div className="mt-8 rounded-md border border-border bg-surface px-4 py-6">
        <div className="text-small text-muted">접수번호</div>
        <div className="mt-1 font-mono text-h1 text-text">{no}</div>
      </div>
      <Link href="/equipment" className="mt-8 inline-block text-small text-muted hover:text-text">
        ← 카탈로그로
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: 에러 바운더리 구현**

`apps/web/src/app/request/error.tsx`:
```tsx
"use client";

// /request 트리 서버컴포넌트(장비 조회 등) 실패 시 폴백.
export default function RequestError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
      <h1 className="text-h1 font-semibold text-text">문제가 발생했습니다</h1>
      <p className="mt-2 text-small text-muted">잠시 후 다시 시도해주세요.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
```

- [ ] **Step 3: 타입체크·빌드 통과 확인**

Run: `pnpm -C apps/web typecheck && pnpm -C apps/web build`
Expected: PASS — `/request`·`/request/success` 라우트가 빌드 출력에 나타남

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/request/success/page.tsx apps/web/src/app/request/error.tsx
git commit -m "feat(web): /request/success 접수번호 페이지 + error 바운더리 (E3 P2)"
```

---

## Task 6: E2E (해피패스 + 검증에러)

**Files:**
- Create: `apps/web/e2e/request.spec.ts`

> 선행: 로컬 Supabase 기동 + T2 마이그레이션 적용(`supabase migration up`). E2E 환경 패턴은 `apps/web/e2e/public-catalog.spec.ts` 답습.

- [ ] **Step 1: E2E 스펙 작성**

`apps/web/e2e/request.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// 로컬 Supabase 표준 데모 키(비밀 아님). public-catalog.spec.ts와 동일.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EQ_NAME = "E2E 견적요청 장비";
const COMPANY = "E2E 견적상사";

function rest(pathAndQuery: string, init: RequestInit) {
  return fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function cleanup() {
  await rest(`applications?company=eq.${encodeURIComponent(COMPANY)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
  await rest(`equipment?name=eq.${encodeURIComponent(EQ_NAME)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});
}

let equipmentId: string;

test.describe.serial("견적요청 E2E", () => {
  test.beforeAll(async () => {
    await cleanup();
    const res = await rest("equipment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        { name: EQ_NAME, base_price: 1000000, status: "active", model: "REQ-E2E", category: "포장기", specs: [] },
      ]),
    });
    if (!res.ok) throw new Error(`E2E 시드 실패: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ id: string }>;
    equipmentId = rows[0].id;
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("작성→제출→접수번호 + DB 저장(new·미배정·fields)", async ({ page }) => {
    await page.goto(`/request?equipment=${equipmentId}`);
    await expect(page.getByText(EQ_NAME)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("회사명").fill(COMPANY);
    await page.getByLabel("대표자명").fill("홍길동");
    await page.getByLabel("사업자등록번호").fill("123-45-67890");
    await page.getByLabel("연락처").fill("02-1234-5678");
    await page.getByLabel("이메일").fill("e2e@example.com");
    await page.getByLabel("주소").fill("서울시 강남구");
    await page.getByLabel("요청사항").fill("E2E 테스트 요청");
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();

    await page.waitForURL(/\/request\/success\?no=REQ-/, { timeout: 15_000 });
    await expect(page.getByText(/REQ-\d{8}-\d{5,}/)).toBeVisible();

    // DB 저장 확인(service role REST).
    const check = await rest(
      `applications?company=eq.${encodeURIComponent(COMPANY)}&select=status,assignee_id,fields`,
      { method: "GET" },
    );
    const rows = (await check.json()) as Array<{ status: string; assignee_id: string | null; fields: Record<string, unknown> }>;
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("new");
    expect(rows[0].assignee_id).toBeNull();
    expect(rows[0].fields.equipment_id).toBe(equipmentId);
  });

  test("빈 폼 제출 시 인라인 에러·미이동", async ({ page }) => {
    await page.goto(`/request`);
    await page.getByRole("button", { name: "견적 요청 보내기" }).click();
    await expect(page.getByText("회사명을 입력하세요")).toBeVisible();
    await expect(page).toHaveURL(/\/request$/);
  });
});
```

- [ ] **Step 2: E2E 실행**

Run: `pnpm -C apps/web test:e2e -- request.spec`
Expected: PASS (2 케이스). (Playwright가 dev 서버를 자동 기동 — `playwright.config.ts`의 webServer 설정)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/e2e/request.spec.ts
git commit -m "test(web): 견적요청 E2E — 제출·접수번호·DB저장·검증에러 (E3 P2)"
```

---

## Task 7: UI-SPEC.md 갱신 + 전체 게이트

**Files:**
- Modify: `UI-SPEC.md` (E3 P2 화면계약 섹션 추가)

- [ ] **Step 1: UI-SPEC.md에 화면계약 추가**

`UI-SPEC.md` 끝(E3 P1 섹션 다음)에 추가:
```markdown
## E3 P2 — 견적요청 폼

### `/request` (견적요청)
- **레이아웃**: `max-w-2xl` 중앙. 헤더(견적 요청 + 안내문) → 선택장비 칩(있을 때) → 입력 그리드 → 제출 버튼.
- **입력 그리드**: 모바일 1열 / `sm` 이상 2열. 코어 6필드(회사명·대표자명·사업자등록번호·연락처·이메일·주소) + 요청사항(textarea, 전폭).
- **필수**: 코어 6필드 모두 필수, 요청사항 선택. 사업자번호·연락처는 `font-mono`(DESIGN.md: 식별자=mono).
- **5-state**: 기본(빈 폼) / 입력중 / 검증에러(필드별 `text-danger` 인라인) / 제출중(버튼 `제출 중…`·비활성) / 서버에러(폼 하단 `text-danger`).
- **선택장비**: `?equipment=[id]`가 active면 상단에 읽기전용 칩(장비명 mono), inactive·없으면 칩 생략(일반 문의).

### `/request/success` (접수완료)
- **레이아웃**: `max-w-lg` 중앙정렬. 완료 헤드라인 → 안내문 → 접수번호 카드(`font-mono text-h1`) → 카탈로그 링크.
- **가드**: `?no` 없이 진입 시 `/equipment` redirect.

### CTA 배선
- 상세(`/equipment/[id]`) "이 장비로 견적 요청" → `/request?equipment=[id]` (P1에서 이미 배선, P2 라우트로 정상화).
```

- [ ] **Step 2: 전체 게이트 실행**

Run (순서대로):
```bash
pnpm -C apps/web typecheck
pnpm -C apps/web lint
pnpm -C apps/web test
pnpm -C apps/web build
pnpm -C packages/db-tests test:rls
pnpm -C apps/web test:e2e
```
Expected: 전부 PASS. `as any` 0건(grep으로 확인: `grep -rn "as any" apps/web/src/app/request apps/web/src/lib/applications` → 결과 없음).

- [ ] **Step 3: 커밋**

```bash
git add UI-SPEC.md
git commit -m "docs: UI-SPEC에 E3 P2 견적요청·접수완료 화면계약 추가 (E3 P2)"
```

---

## 완료 기준 (Definition of Done)

- [ ] T1~T7 전 태스크 커밋 완료
- [ ] 게이트 GREEN: web typecheck·lint·test·build + db-tests `test:rls` + E2E, `as any` 0
- [ ] anon 고객이 `/equipment` → 상세 → CTA → `/request` → 제출 → `/request/success`에서 REQ- 접수번호 확인까지 완주
- [ ] `applications` 행이 `status='new'`·`assignee_id=null`·`fields.equipment_id` 저장 확인
- [ ] silent-fail 제거(RPC 실패 시 명시적 에러 통지)
- [ ] **머지**: P1 + P2를 하나의 PR로 E3 머지(메모리 계획). DB 반영은 머지 후 `supabase db push`.

## 미해결/후속 (YAGNI — 본 플랜 범위 밖)
- 이메일 자동알림(Railway 워커 = 후속 에픽), 첨부파일, reCAPTCHA, 고객 요청 조회.
