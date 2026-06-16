# 비밀번호 변경 (본인·관리자재설정·강제변경) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원이 임시 비밀번호로 로그인한 뒤 본인이 직접 비밀번호를 바꾸고, 관리자가 직원 비밀번호를 새 임시값으로 재설정하며, 임시 비밀번호 상태에서는 바꾸기 전까지 콘솔을 차단한다.

**Architecture:** `profiles.must_change_password` 플래그 컬럼 1개를 추가한다. 본인 변경은 `/admin/account` 페이지 + 서버 액션(현재 비밀번호 재로그인 검증 → `auth.updateUser` → admin 클라로 플래그 해제). 강제 변경은 미들웨어 없이 모든 콘솔 페이지가 거치는 `admin/layout.tsx`에서 플래그를 읽어 사이드바·본문 대신 전체화면 변경 패널을 렌더. 관리자 재설정은 admin 클라로 새 임시값 발급 + 플래그 set. 비밀번호 규칙은 shared 순수함수로 검증.

**Tech Stack:** Next.js 16 App Router(서버 액션·서버 컴포넌트), Supabase Auth(`@supabase/ssr`, `@supabase/supabase-js`), Postgres RLS, Vitest(shared 단위 + pg 기반 db-tests), Playwright(e2e), pnpm monorepo.

설계 문서: `docs/superpowers/specs/2026-06-16-password-change-design.md`

---

## 파일 구조 (생성/수정)

**생성:**
- `packages/shared/src/password.ts` — `validateNewPassword` 순수함수
- `packages/shared/src/password.test.ts` — 단위 테스트
- `supabase/migrations/20260616180000_password_must_change.sql` — 컬럼 추가
- `supabase/rollback/20260616180000_password_must_change_down.sql` — 롤백
- `packages/db-tests/src/password_must_change.test.ts` — 컬럼 RLS 테스트
- `apps/web/src/lib/users/password-actions.ts` — `changeOwnPasswordAction`, `resetUserPasswordAction`
- `apps/web/src/app/admin/account/page.tsx` — 계정 설정 페이지
- `apps/web/src/app/admin/account/ChangePasswordForm.tsx` — 변경 폼(계정 페이지 + 강제 패널 공용)
- `apps/web/src/app/admin/_components/ForcedPasswordChange.tsx` — 강제 변경 전체화면 패널
- `apps/web/e2e/password-change.spec.ts` — e2e

**수정:**
- `packages/shared/src/index.ts` — `password` re-export
- `apps/web/src/lib/users/actions.ts` — `createUserAction` patch에 `must_change_password: true`
- `apps/web/src/lib/auth/guard.ts` — `loadAccessContext`/`GuardResult`에 `mustChangePassword` 추가
- `apps/web/src/app/admin/layout.tsx` — 강제 패널 분기 + 아바타→`/admin/account` 링크
- `apps/web/src/app/admin/users/[id]/EditUserClient.tsx` — 비밀번호 재설정 버튼 + 임시값 노출
- `apps/web/e2e/e5a-permissions.spec.ts` — 시나리오 2 갱신(재로그인 시 강제 패널 → 변경 후 콘솔)

---

## Task 1: shared `validateNewPassword` 순수함수 (TDD)

**Files:**
- Create: `packages/shared/src/password.ts`
- Test: `packages/shared/src/password.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/src/password.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword — 새 비밀번호 규칙(최소 8자 + 현재와 동일 금지)", () => {
  test("8자 미만은 거부", () => {
    expect(validateNewPassword("a1b2c3d", {})).toBe("비밀번호는 8자 이상이어야 합니다");
  });

  test("정확히 8자는 통과", () => {
    expect(validateNewPassword("a1b2c3d4", {})).toBeNull();
  });

  test("현재 비밀번호와 같으면 거부", () => {
    expect(validateNewPassword("samePass1", { current: "samePass1" })).toBe(
      "현재 비밀번호와 다른 비밀번호를 입력하세요",
    );
  });

  test("현재 비밀번호와 다르면 통과", () => {
    expect(validateNewPassword("newPass12", { current: "oldPass12" })).toBeNull();
  });

  test("공백을 trim하지 않는다(앞뒤 공백 포함 8자면 통과)", () => {
    expect(validateNewPassword("  abcd  ", {})).toBeNull();
  });

  test("current 미지정이면 동일성 검사 건너뜀", () => {
    expect(validateNewPassword("anything8", {})).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test password`
Expected: FAIL — `validateNewPassword` is not a function / 모듈 없음

- [ ] **Step 3: 최소 구현**

`packages/shared/src/password.ts`:

```ts
// 새 비밀번호 규칙 — 최소 8자, 현재 비밀번호와 동일 금지(사용자 결정 "느슨함").
// 비밀번호는 trim하지 않는다(공백도 유효 문자). 위반 메시지(string) | 통과(null) 반환.
export function validateNewPassword(
  next: string,
  opts: { current?: string },
): string | null {
  if (next.length < 8) return "비밀번호는 8자 이상이어야 합니다";
  if (opts.current !== undefined && next === opts.current) {
    return "현재 비밀번호와 다른 비밀번호를 입력하세요";
  }
  return null;
}
```

- [ ] **Step 4: index.ts에 re-export 추가**

`packages/shared/src/index.ts`의 마지막 `export * from` 줄들 뒤에 추가:

```ts
export * from "./password";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test password`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/password.ts packages/shared/src/password.test.ts packages/shared/src/index.ts
git commit -m "feat: 새 비밀번호 검증 순수함수(validateNewPassword) — shared"
```

---

## Task 2: DB 마이그레이션 — `profiles.must_change_password` 컬럼

**Files:**
- Create: `supabase/migrations/20260616180000_password_must_change.sql`
- Create: `supabase/rollback/20260616180000_password_must_change_down.sql`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260616180000_password_must_change.sql`:

```sql
-- 비밀번호 변경 기능 — 임시 비밀번호 상태 표시 플래그.
-- 의도: 계정 생성·관리자 재설정 시 true, 본인이 비밀번호를 바꾸면 false.
--   true인 동안 admin 콘솔 layout이 강제 변경 패널을 띄워 콘솔 사용을 막는다.
-- RLS: 기존 profiles_update 정책(users.manage만)이 그대로 적용 → 일반 직원은 이 플래그를
--   스스로 끌 수 없다. 해제는 본인 변경 서버 액션이 admin(service_role) 클라이언트로 수행.
-- rollback: supabase/rollback/20260616180000_password_must_change_down.sql

alter table public.profiles
  add column must_change_password boolean not null default false;
```

- [ ] **Step 2: 롤백 작성**

`supabase/rollback/20260616180000_password_must_change_down.sql`:

```sql
-- 20260616180000_password_must_change.sql 롤백.
alter table public.profiles
  drop column if exists must_change_password;
```

- [ ] **Step 3: 로컬 적용 확인**

Run: `supabase db reset`
Expected: 전 마이그레이션 무오류 적용(`...password_must_change` 포함). 이어서 시드 복구:
Run: `bash supabase/seed/seed-local.sh`

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260616180000_password_must_change.sql supabase/rollback/20260616180000_password_must_change_down.sql
git commit -m "feat: profiles.must_change_password 컬럼 + 롤백"
```

---

## Task 3: db-tests — `must_change_password` 기본값·RLS 검증

**Files:**
- Create: `packages/db-tests/src/password_must_change.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/db-tests/src/password_must_change.test.ts`:

```ts
// 비밀번호 변경 기능 — must_change_password 컬럼 기본값 + RLS 검증.
// 일반 직원은 본인 must_change_password를 직접 끌 수 없어야 한다(profiles_update=users.manage).
// 관리자(users.manage)는 타인의 플래그를 변경할 수 있어야 한다.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "pw-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "pw-sales1@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}', is_active=true where id=$1", [UID.admin]);
  await c.query(
    "update public.profiles set permissions='{customers.edit}', is_active=true, must_change_password=true where id=$1",
    [UID.sales1],
  );
}

describe("must_change_password 컬럼", () => {
  test("신규 profiles 기본값은 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "pw-sales2@jhtech.test");
      const r = await c.query("select must_change_password from public.profiles where id=$1", [UID.sales2]);
      expect(r.rows[0].must_change_password).toBe(false);
    });
  });

  test("일반 직원은 본인 must_change_password를 직접 끌 수 없다(RLS 0행)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.profiles set must_change_password=false where id=$1 returning id",
        [UID.sales1],
      );
      // profiles_update 정책이 users.manage만 허용 → 본인 행도 UPDATE 불가 → 0행.
      expect(r.rowCount).toBe(0);
    });
  });

  test("관리자(users.manage)는 타인의 must_change_password를 변경할 수 있다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.profiles set must_change_password=true where id=$1 returning id",
        [UID.sales1],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행(컬럼 적용 상태에서 통과해야 함)**

Run: `pnpm --filter @jhtechsaas/db-tests test password_must_change`
Expected: PASS (3 tests). 만약 "column does not exist"면 Task 2의 `supabase db reset` 미적용 → 재적용.

- [ ] **Step 3: 커밋**

```bash
git add packages/db-tests/src/password_must_change.test.ts
git commit -m "test: must_change_password 기본값·RLS db-test"
```

---

## Task 4: 계정 생성 시 `must_change_password=true` 설정

**Files:**
- Modify: `apps/web/src/lib/users/actions.ts`

- [ ] **Step 1: createUserAction의 patch 수정**

`apps/web/src/lib/users/actions.ts`에서 아래 줄을 찾는다:

```ts
  const patch = { permissions, name, is_active: isActive };
```

다음으로 교체:

```ts
  // 신규 계정은 임시 비밀번호 상태 → 첫 로그인 시 강제 변경.
  const patch = { permissions, name, is_active: isActive, must_change_password: true };
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS (must_change_password는 profiles 컬럼이라 PostgREST update 타입 허용)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/users/actions.ts
git commit -m "feat: 계정 생성 시 must_change_password=true"
```

---

## Task 5: 가드에 `mustChangePassword` 노출

**Files:**
- Modify: `apps/web/src/lib/auth/guard.ts`

- [ ] **Step 1: loadAccessContext가 컬럼을 읽도록 수정**

`apps/web/src/lib/auth/guard.ts`에서 `loadAccessContext`의 반환 타입과 select를 수정한다.

먼저 함수 시그니처의 반환 타입:

```ts
async function loadAccessContext(): Promise<
  { userId: string; permissions: string[]; isActive: boolean } | null
> {
```

다음으로 교체:

```ts
async function loadAccessContext(): Promise<
  { userId: string; permissions: string[]; isActive: boolean; mustChangePassword: boolean } | null
> {
```

그리고 select 줄:

```ts
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("permissions,is_active")
    .eq("id", user.id)
    .single();
```

다음으로 교체:

```ts
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("permissions,is_active,must_change_password")
    .eq("id", user.id)
    .single();
```

그리고 return 블록:

```ts
  return {
    userId: user.id,
    permissions: profile.permissions ?? [],
    isActive: profile.is_active ?? false,
  };
```

다음으로 교체:

```ts
  return {
    userId: user.id,
    permissions: profile.permissions ?? [],
    isActive: profile.is_active ?? false,
    mustChangePassword: profile.must_change_password ?? false,
  };
```

- [ ] **Step 2: GuardResult ok 타입에 optional 필드 추가**

`apps/web/src/lib/auth/guard.ts` 상단의:

```ts
export type GuardResult =
  | { status: "ok"; userId: string; permissions: string[] }
  | { status: "forbidden" };
```

다음으로 교체:

```ts
export type GuardResult =
  | { status: "ok"; userId: string; permissions: string[]; mustChangePassword?: boolean }
  | { status: "forbidden" };
```

- [ ] **Step 3: requireAnyConsoleCapability가 플래그를 포함하도록 수정**

`requireAnyConsoleCapability`의 ok 반환:

```ts
  if (!ctx.isActive || !hasAnyConsoleCapability(ctx.permissions)) {
    return { status: "forbidden" };
  }
  return { status: "ok", userId: ctx.userId, permissions: ctx.permissions };
```

다음으로 교체(마지막 return 줄만 변경):

```ts
  if (!ctx.isActive || !hasAnyConsoleCapability(ctx.permissions)) {
    return { status: "forbidden" };
  }
  return {
    status: "ok",
    userId: ctx.userId,
    permissions: ctx.permissions,
    mustChangePassword: ctx.mustChangePassword,
  };
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/auth/guard.ts
git commit -m "feat: 가드에 mustChangePassword 노출"
```

---

## Task 6: 서버 액션 — `changeOwnPasswordAction` · `resetUserPasswordAction`

**Files:**
- Create: `apps/web/src/lib/users/password-actions.ts`

- [ ] **Step 1: 액션 파일 작성**

`apps/web/src/lib/users/password-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAnonClient, validateNewPassword } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/env";
import { generateTempPassword } from "./password";

export type ChangePasswordResult = { error: string } | { ok: true };
export type ResetPasswordResult = { error: string } | { ok: true; tempPassword: string };

const changeSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요"),
  newPassword: z.string().min(1, "새 비밀번호를 입력하세요"),
});

// 본인 비밀번호 변경 — 로그인 세션 필요. 현재 비밀번호 재로그인 검증 → updateUser → 플래그 해제.
export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const { currentPassword, newPassword } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "로그인이 필요합니다" };

  // 1) 현재 비밀번호 검증 — 세션을 건드리지 않는 별도 anon 클라이언트로 재로그인 시도.
  //    createAnonClient는 SSR 쿠키 클라이언트가 아니라 인메모리 클라이언트라 현재 콘솔 세션에 영향 없음.
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const verifier = createAnonClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const verify = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verify.error) return { error: "현재 비밀번호가 올바르지 않습니다" };

  // 2) 새 비밀번호 규칙 검증.
  const violation = validateNewPassword(newPassword, { current: currentPassword });
  if (violation) return { error: violation };

  // 3) 비밀번호 변경(현재 세션 클라이언트).
  const updated = await supabase.auth.updateUser({ password: newPassword });
  if (updated.error) return { error: "비밀번호 변경에 실패했습니다" };

  // 4) 강제 변경 플래그 해제 — 일반 직원은 RLS상 본인 profiles UPDATE 불가 → admin 클라로 수행.
  //    세션 user.id 본인 행만 변경하므로 안전.
  const admin = createSupabaseAdminClient();
  const cleared = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (cleared.error) {
    // 비밀번호는 이미 바뀌었으나 플래그 해제 실패 — 다음 로그인에 강제 패널이 또 뜰 수 있음.
    return { error: "비밀번호는 변경됐으나 상태 갱신에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

// 관리자 비밀번호 재설정 — users.manage 필요. 새 임시 비밀번호 발급 + 강제 변경 플래그 set.
export async function resetUserPasswordAction(userId: string): Promise<ResetPasswordResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };

  const id = z.string().uuid().safeParse(userId);
  if (!id.success) return { error: "잘못된 사용자입니다" };

  const admin = createSupabaseAdminClient();
  const tempPassword = generateTempPassword();

  const updated = await admin.auth.admin.updateUserById(id.data, { password: tempPassword });
  if (updated.error) return { error: `재설정 실패: ${updated.error.message}` };

  const flagged = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", id.data);
  if (flagged.error) {
    return { error: "비밀번호는 재설정됐으나 상태 갱신에 실패했습니다" };
  }

  revalidatePath(`/admin/users/${id.data}`);
  return { ok: true, tempPassword };
}
```

참고: `z.string().uuid()`는 프로젝트에서 구조화/seed UUID를 거부한 전례가 있다([[zod4-uuid-strict-gotcha]] — version 비트 검사). 실제 Supabase auth.users id는 표준 v4라 통과하지만, 혹시 db-test에서 쓰는 고정 UUID(`0000…00a1`)를 이 액션 e2e에 넣지 말 것. 만약 e2e에서 거부되면 `z.string().min(1)`로 완화 후 주석으로 사유 명시.

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/users/password-actions.ts
git commit -m "feat: 비밀번호 변경·관리자 재설정 서버 액션"
```

---

## Task 7: `ChangePasswordForm` 컴포넌트 (계정 페이지 + 강제 패널 공용)

**Files:**
- Create: `apps/web/src/app/admin/account/ChangePasswordForm.tsx`

- [ ] **Step 1: 폼 컴포넌트 작성**

`apps/web/src/app/admin/account/ChangePasswordForm.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateNewPassword } from "@jhtechsaas/shared";
import { changeOwnPasswordAction } from "@/lib/users/password-actions";

// 비밀번호 변경 폼 — /admin/account(자발적)와 강제 변경 패널(forced)에서 공용.
// 클라 1차 검증(즉시 피드백) + 서버 액션이 현재 비밀번호 재검증·권위.
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // 클라 1차 검증.
    if (next !== confirm) {
      setMessage({ kind: "error", text: "새 비밀번호가 일치하지 않습니다" });
      return;
    }
    const violation = validateNewPassword(next, { current });
    if (violation) {
      setMessage({ kind: "error", text: violation });
      return;
    }

    startTransition(async () => {
      const res = await changeOwnPasswordAction({ currentPassword: current, newPassword: next });
      if ("error" in res) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setMessage({ kind: "ok", text: "비밀번호가 변경되었습니다" });
      setCurrent("");
      setNext("");
      setConfirm("");
      // 강제 모드: 플래그가 풀렸으니 새로고침하면 콘솔로 진입.
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">현재 비밀번호</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">새 비밀번호 (8자 이상)</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">새 비밀번호 확인</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-small font-medium ${
            message.kind === "ok" ? "bg-active/10 text-active" : "bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
      >
        {pending ? "변경 중…" : forced ? "비밀번호 변경하고 시작하기" : "비밀번호 변경"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/account/ChangePasswordForm.tsx
git commit -m "feat: 비밀번호 변경 폼 컴포넌트(계정·강제 공용)"
```

---

## Task 8: `/admin/account` 계정 설정 페이지 + 아바타 링크

**Files:**
- Create: `apps/web/src/app/admin/account/page.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: 계정 페이지 작성**

`apps/web/src/app/admin/account/page.tsx`:

```tsx
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./ChangePasswordForm";

// 계정 설정 — 로그인한 콘솔 사용자 본인의 이메일·이름·권한(읽기전용) + 비밀번호 변경.
export default async function AccountPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-h1 font-semibold text-text">계정</h1>
        <p className="text-small text-muted">콘솔 접근 권한이 없습니다.</p>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", access.userId)
    .single();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h1 font-semibold text-text">계정 설정</h1>

      <div className="flex max-w-md flex-col gap-1 rounded-md border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">이름</span>
          <span className="text-small text-text">{profile?.name ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">이메일</span>
          <span className="font-mono text-small text-text">{user?.email ?? "-"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold text-text">비밀번호 변경</h2>
        <ChangePasswordForm />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 아바타를 /admin/account 링크로 변경**

`apps/web/src/app/admin/layout.tsx` 상단 import에 `Link` 추가(파일 맨 위 import 블록):

```tsx
import Link from "next/link";
```

그리고 상단바의 아바타 span:

```tsx
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-small font-semibold text-white">
              {isAdmin ? "관" : "영"}
            </span>
```

다음으로 교체:

```tsx
            <Link
              href="/admin/account"
              title="계정 설정"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-small font-semibold text-white"
            >
              {isAdmin ? "관" : "영"}
            </Link>
```

- [ ] **Step 3: 타입체크 + 빌드 시작 확인**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/admin/account/page.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat: /admin/account 계정 설정 페이지 + 아바타 진입"
```

---

## Task 9: 강제 변경 패널 — `admin/layout.tsx` 분기

**Files:**
- Create: `apps/web/src/app/admin/_components/ForcedPasswordChange.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: 강제 변경 패널 컴포넌트 작성**

`apps/web/src/app/admin/_components/ForcedPasswordChange.tsx`:

```tsx
import { signOut } from "@/app/login/actions";
import { ChangePasswordForm } from "../account/ChangePasswordForm";

// 강제 변경 패널 — must_change_password=true인 사용자에게 콘솔 대신 전체화면 렌더.
// 변경 전엔 어떤 메뉴에도 접근 불가(layout이 children 대신 이걸 렌더).
export function ForcedPasswordChange() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-semibold text-text">비밀번호를 변경해야 합니다</h1>
          <p className="text-small text-muted">
            임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호로 변경하세요.
          </p>
        </div>
        <ChangePasswordForm forced />
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: layout에 분기 추가**

`apps/web/src/app/admin/layout.tsx`에서 forbidden 분기 블록(닫는 `}` 직후) 다음에 강제 패널 분기를 추가한다.

먼저 import 블록에 추가:

```tsx
import { ForcedPasswordChange } from "./_components/ForcedPasswordChange";
```

그리고 아래 forbidden 블록:

```tsx
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 없거나 비활성 계정입니다. 관리자에게 문의하세요.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }
```

이 블록 **바로 다음에** 추가:

```tsx
  // 임시 비밀번호 상태 → 변경 전엔 콘솔 차단(사이드바·본문 대신 전체화면 변경 패널).
  if (access.mustChangePassword) {
    return <ForcedPasswordChange />;
  }
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/admin/_components/ForcedPasswordChange.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat: 임시 비밀번호 강제 변경 패널(layout 차단)"
```

---

## Task 10: 관리자 재설정 버튼 — `EditUserClient`

**Files:**
- Modify: `apps/web/src/app/admin/users/[id]/EditUserClient.tsx`

- [ ] **Step 1: 재설정 버튼 + 임시값 노출 추가**

`apps/web/src/app/admin/users/[id]/EditUserClient.tsx` 상단 import에 추가:

```tsx
import { resetUserPasswordAction } from "@/lib/users/password-actions";
import { TempPasswordModal } from "../_components/TempPasswordModal";
```

컴포넌트 본문의 기존 state 선언들(`const [activePending, startActive] = useTransition();`) 다음에 추가:

```tsx
  const [resetPending, startReset] = useTransition();
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  function resetPassword() {
    if (!window.confirm("이 사용자의 비밀번호를 새 임시 비밀번호로 재설정할까요?")) return;
    setMessage(null);
    startReset(async () => {
      const res = await resetUserPasswordAction(user.id);
      if ("error" in res) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setResetResult({ email: user.email ?? "-", password: res.tempPassword });
    });
  }
```

그리고 `상태` 행이 들어있는 카드(`<div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4">`)의 닫는 `</div>` 직전에 비밀번호 재설정 행을 추가:

```tsx
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">비밀번호</span>
          <button
            onClick={resetPassword}
            disabled={resetPending}
            className="text-small text-accent underline disabled:opacity-40 disabled:no-underline"
          >
            {resetPending ? "재설정 중…" : "임시 비밀번호로 재설정"}
          </button>
        </div>
```

마지막으로 컴포넌트가 반환하는 최상위 `</div>`(닫기) 직전, 즉 `return (` 의 바깥 래퍼 끝에 모달을 조건부로 추가한다. 현재 최상위 래퍼가 `<div className="flex max-w-2xl flex-col gap-5">`이므로, 그 닫는 `</div>` 바로 앞에:

```tsx
      {resetResult && (
        <TempPasswordModal
          email={resetResult.email}
          password={resetResult.password}
          onClose={() => {
            setResetResult(null);
            router.refresh();
          }}
        />
      )}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @jhtechsaas/web typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add "apps/web/src/app/admin/users/[id]/EditUserClient.tsx"
git commit -m "feat: 관리자 사용자 비밀번호 재설정 버튼 + 임시값 노출"
```

---

## Task 11: e2e — 비밀번호 변경 흐름 + 기존 e5a 시나리오 갱신

**Files:**
- Create: `apps/web/e2e/password-change.spec.ts`
- Modify: `apps/web/e2e/e5a-permissions.spec.ts`

- [ ] **Step 1: 신규 e2e 작성**

`apps/web/e2e/password-change.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// 비밀번호 변경 e2e:
//  1) 관리자가 신규 계정 생성 → 임시PW로 로그인하면 강제 변경 패널 → 변경 후 콘솔 진입
//  2) /admin/account 클라 검증(불일치·8자 미만)은 서버 도달 전에 막힘
//  3) 관리자 재설정: 신규 계정 편집 페이지에서 재설정 → 임시PW 1회 노출
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const NEW_EMAIL = "e2e-pwchange-newsales@jhtech.test";
const NEW_NAME = "E2E비번변경영업";
const NEW_PASSWORD = "newPass1234";

function authAdmin(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function deleteAuthUserByEmail(email: string) {
  const res = await authAdmin("users?per_page=1000").catch(() => null);
  if (!res || !res.ok) return;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (body.users ?? []).find((x) => x.email === email);
  if (u) await authAdmin(`users/${u.id}`, { method: "DELETE" }).catch(() => {});
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).first().click();
}

test.beforeAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});
test.afterAll(async () => {
  await deleteAuthUserByEmail(NEW_EMAIL);
});

test("신규 계정 임시PW 로그인 → 강제 변경 패널 → 변경 후 콘솔 진입", async ({ page }) => {
  // 관리자로 신규 계정 생성 → 임시PW 캡처.
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/users/new");
  await page.getByLabel("이름").fill(NEW_NAME);
  await page.getByLabel("이메일 (로그인 ID)").fill(NEW_EMAIL);
  await page.getByRole("button", { name: "계정 생성" }).click();
  const temp = await page.getByTestId("temp-password").innerText();
  expect(temp.length).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "닫기" }).click();
  await logout(page);

  // 임시PW로 로그인 → 강제 변경 패널이 떠야 함(콘솔 진입 차단).
  await login(page, NEW_EMAIL, temp);
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeVisible();

  // 변경 → 콘솔 진입.
  await page.getByLabel("현재 비밀번호").fill(temp);
  await page.getByLabel("새 비밀번호 (8자 이상)").fill(NEW_PASSWORD);
  await page.getByLabel("새 비밀번호 확인").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "비밀번호 변경하고 시작하기" }).click();
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeHidden();
});

test("/admin/account 새 비밀번호 불일치는 클라에서 막힘", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/account");
  await page.getByLabel("현재 비밀번호").fill("whatever12");
  await page.getByLabel("새 비밀번호 (8자 이상)").fill("abcdefgh1");
  await page.getByLabel("새 비밀번호 확인").fill("different1");
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page.getByText("새 비밀번호가 일치하지 않습니다")).toBeVisible();
});
```

참고: 관리자 본인(admin@jhtech.local)의 실제 비밀번호는 이 테스트에서 변경하지 않는다(불일치로 클라 단계에서 막혀 서버 도달 X) → 시드 로그인 보존.

- [ ] **Step 2: 신규 e2e 실행(클린 환경)**

```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/web test:e2e password-change
```
Expected: 2 tests PASS

- [ ] **Step 3: 기존 e5a 시나리오 2 갱신**

`apps/web/e2e/e5a-permissions.spec.ts`에서 시나리오 2는 "신규 계정 생성 → 임시PW로 재로그인 성공"인데, 이제 임시PW 로그인 시 **강제 변경 패널**이 뜬다. 해당 테스트에서 재로그인 직후 콘솔 진입을 단언하는 부분을 찾아, 강제 패널 노출 → 비밀번호 변경 → 콘솔 진입으로 갱신한다.

재로그인 후 단언 부분(예: `await expect(page.getByText(...console...)).toBeVisible()` 또는 nav 단언)을 다음 흐름으로 교체:

```ts
  // (E5a 변경) 임시PW 로그인 시 강제 변경 패널 → 변경해야 콘솔 진입.
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeVisible();
  await page.getByLabel("현재 비밀번호").fill(newPassword);
  await page.getByLabel("새 비밀번호 (8자 이상)").fill("e2eChanged123");
  await page.getByLabel("새 비밀번호 확인").fill("e2eChanged123");
  await page.getByRole("button", { name: "비밀번호 변경하고 시작하기" }).click();
  await expect(page.getByText("비밀번호를 변경해야 합니다")).toBeHidden();
```

이후 시나리오 3(is_active=false 차단)이 같은 계정을 비활성화해 재로그인 차단을 검증한다면, 비밀번호가 `e2eChanged123`으로 바뀐 점을 반영해 해당 로그인에 새 비밀번호를 쓰도록 맞춘다. (시나리오 3가 service_role로 비활성화 후 로그인 차단만 본다면 비밀번호 무관 — 코드 확인 후 필요한 경우만 수정.)

- [ ] **Step 4: e5a e2e 재실행**

```bash
pnpm --filter @jhtechsaas/web test:e2e e5a-permissions
```
Expected: PASS (3 시나리오)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/e2e/password-change.spec.ts apps/web/e2e/e5a-permissions.spec.ts
git commit -m "test: 비밀번호 변경 e2e + e5a 강제변경 반영"
```

---

## Task 12: 전체 게이트 통과 확인

**Files:** (없음 — 검증만)

- [ ] **Step 1: 클린 DB + 시드**

```bash
supabase db reset && bash supabase/seed/seed-local.sh
```

- [ ] **Step 2: 전체 게이트 실행**

```bash
pnpm --filter @jhtechsaas/shared test
pnpm --filter @jhtechsaas/web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter @jhtechsaas/web typecheck
pnpm --filter @jhtechsaas/web lint
pnpm --filter @jhtechsaas/web build
pnpm --filter @jhtechsaas/web test:e2e
```
Expected: 전부 PASS

- [ ] **Step 3: `as any` 0 확인**

Run: `grep -rn "as any" apps/web/src packages/shared/src packages/db-tests/src | grep -v "// " || echo "as any 없음"`
Expected: `as any 없음` (또는 정당한 사유 주석이 달린 기존 항목만)

- [ ] **Step 4: 최종 상태 확인**

Run: `git status --short && git log --oneline -12`
Expected: 워킹트리 clean, Task별 커밋 존재

---

## Self-Review 메모

- **Spec 커버리지**: DB 컬럼(Task 2/3) · 본인 변경(Task 6/7/8) · 강제 변경(Task 5/9) · 관리자 재설정(Task 6/10) · 공통 규칙(Task 1) · 계정 생성 플래그(Task 4) · 테스트(Task 3/11/12) 모두 매핑됨.
- **통합 리스크**: Task 4의 `must_change_password=true`가 기존 `e5a-permissions.spec.ts` 시나리오 2(임시PW 재로그인=콘솔 진입 가정)를 깬다 → Task 11 Step 3에서 명시적으로 갱신.
- **타입 일관성**: `mustChangePassword`(웹 가드, camelCase) ↔ `must_change_password`(DB/PostgREST, snake_case) 구분 유지. 액션 함수명 `changeOwnPasswordAction`·`resetUserPasswordAction`는 Task 6 정의 후 Task 7/10에서 동일하게 사용.
- **엣지**: 권한 0개 신규 계정은 `is_active=false` → forbidden 패널이 강제 패널보다 먼저(설계 §4.3). 현실 시나리오(권한 부여 생성)는 active → 강제 패널 정상.
