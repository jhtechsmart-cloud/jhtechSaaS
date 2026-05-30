# E2 P1 — 웹 인증 토대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase SSR 쿠키 인증 토대를 깐다 — 로그인하면 보호된 `/admin` 콘솔 셸이 열리고, 미인증은 `/login`으로 가드된다(E4 콘솔 재사용).

**Architecture:** Next 16 App Router. `proxy.ts`(구 middleware)가 세션을 갱신하고 미인증 `/admin/*` 접근을 `/login`으로 리다이렉트. 서버 컴포넌트(admin layout)가 `equipment.manage` 권한을 DB로 검증해 403 분기. 권한 판정의 순수 로직은 `resolveAccess()`로 분리해 단위 테스트한다. Server Action은 직접 POST로도 도달 가능하므로 각자 권한을 재검증한다(proxy만 신뢰 금지).

**Tech Stack:** Next 16.2.6 · React 19 · @supabase/ssr · @supabase/supabase-js 2.x · Tailwind 4 · Vitest 3 · zod 4

---

> 설계: `docs/superpowers/specs/2026-05-30-e2-equipment-admin-design.md` · 화면 계약: `UI-SPEC.md` · 시스템 토큰: `DESIGN.md`
> ⚠️ Next 16 검증 완료: `middleware.ts`→`proxy.ts`(함수명 `proxy`), `cookies()`는 async(`await cookies()`). 코드 전 `apps/web/node_modules/next/dist/docs/01-app` 참조(AGENTS.md).
> ⚠️ `@supabase/ssr` 쿠키 API(`getAll`/`setAll`)는 버전 민감 — 설치 후 `node_modules/@supabase/ssr` README로 시그니처 확인.

## File Structure

| 파일 | 책임 |
|---|---|
| `apps/web/package.json` | deps 추가(@supabase/ssr·supabase-js), test 스크립트 |
| `apps/web/vitest.config.ts` | Vitest(node 환경) 설정 |
| `apps/web/src/lib/auth/access.ts` | `resolveAccess()` 순수 권한 판정 (단위 테스트 핵심) |
| `apps/web/src/lib/auth/access.test.ts` | access 단위 테스트 |
| `apps/web/src/lib/supabase/server.ts` | SSR 서버 클라이언트(쿠키, RLS=세션) |
| `apps/web/src/lib/supabase/browser.ts` | SSR 브라우저 클라이언트(P3 업로드용, 여기서 확립) |
| `apps/web/src/lib/auth/guard.ts` | `requirePermission()` 세션+권한 서버 검증 |
| `apps/web/src/proxy.ts` | 세션 갱신 + `/admin/*` 미인증 가드 |
| `apps/web/src/app/login/actions.ts` | `signIn`/`signOut` Server Actions |
| `apps/web/src/app/login/page.tsx` | 로그인 폼(useActionState) |
| `apps/web/src/app/admin/layout.tsx` | 콘솔 셸 + 권한 가드(403 분기) |
| `apps/web/src/app/admin/equipment/page.tsx` | 목록 placeholder(P2가 채움) |
| `apps/web/src/app/globals.css` | DESIGN.md 디자인 토큰(@theme) 1회 확립 |

각 파일은 단일 책임. `access.ts`(순수)와 `guard.ts`(I/O)를 분리해 핵심 로직을 격리 테스트한다.

---

## Task 1: apps/web 의존성 + Vitest 설정

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: 런타임/개발 의존성 설치**

Run:
```bash
cd ~/Projects/jhtechSaaS
pnpm --filter web add @supabase/ssr @supabase/supabase-js
pnpm --filter web add -D vitest
```
Expected: `apps/web/package.json` dependencies에 `@supabase/ssr`, `@supabase/supabase-js`, devDependencies에 `vitest` 추가.

- [ ] **Step 2: @supabase/ssr 쿠키 API 시그니처 확인 (버전 가드)**

Run:
```bash
grep -rn "getAll\|setAll\|createServerClient" node_modules/@supabase/ssr/dist/main/createServerClient.js 2>/dev/null | head -10
node -e "console.log('ssr', require('./node_modules/@supabase/ssr/package.json').version)"
```
Expected: `cookies: { getAll, setAll }` 패턴 확인(현 메이저). 다르면 그 버전 README대로 Task 4/5의 cookies 어댑터 조정.

- [ ] **Step 3: test 스크립트 추가**

`apps/web/package.json`의 `scripts`에 추가:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Vitest 설정 작성**

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 순수 로직 단위 테스트용(node 환경). UI/통합은 E2E(P3)에서 다룬다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 5: 빈 테스트로 러너 동작 확인**

Run: `pnpm --filter web test`
Expected: "No test files found" 또는 0 tests (러너는 정상 기동). 에러 없으면 통과.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(web): @supabase/ssr·supabase-js 추가 + Vitest 설정"
```

---

## Task 2: resolveAccess() 순수 권한 판정 (TDD)

권한 판정의 핵심을 순수 함수로 분리. 세션·DB I/O 없이 단위 테스트한다.

**Files:**
- Create: `apps/web/src/lib/auth/access.ts`
- Test: `apps/web/src/lib/auth/access.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `apps/web/src/lib/auth/access.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveAccess } from "./access";

describe("resolveAccess", () => {
  it("userId 없으면 unauthenticated", () => {
    expect(resolveAccess(null, null, "equipment.manage")).toEqual({
      status: "unauthenticated",
    });
  });

  it("로그인했으나 권한 없으면 forbidden", () => {
    expect(resolveAccess("u1", ["quotes.write"], "equipment.manage")).toEqual({
      status: "forbidden",
    });
  });

  it("권한 보유 시 ok", () => {
    expect(resolveAccess("u1", ["equipment.manage"], "equipment.manage")).toEqual({
      status: "ok",
    });
  });

  it("users.manage(슈퍼)는 모든 권한 통과", () => {
    expect(resolveAccess("u1", ["users.manage"], "equipment.manage")).toEqual({
      status: "ok",
    });
  });

  it("permissions가 null이면 forbidden(로그인은 됨)", () => {
    expect(resolveAccess("u1", null, "equipment.manage")).toEqual({
      status: "forbidden",
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test`
Expected: FAIL — `resolveAccess` is not defined (모듈 없음).

- [ ] **Step 3: 최소 구현**

Create `apps/web/src/lib/auth/access.ts`:
```ts
import { can, type PermissionKey } from "@jhtechsaas/shared";

// 세션 유무 + 권한으로 접근을 판정하는 순수 함수.
// 실제 강제는 항상 서버 RLS가 하고, 이건 UI 분기·가드 판정용.
export type AccessResult =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok" };

export function resolveAccess(
  userId: string | null,
  permissions: readonly string[] | null,
  required: PermissionKey,
): AccessResult {
  if (!userId) return { status: "unauthenticated" };
  if (!permissions || !can(permissions, required)) {
    return { status: "forbidden" };
  }
  return { status: "ok" };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web test`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/access.ts apps/web/src/lib/auth/access.test.ts
git commit -m "feat(web): resolveAccess 순수 권한 판정 + 단위 테스트"
```

---

## Task 3: Supabase SSR 클라이언트 (server / browser)

단위 테스트 불가(supabase·쿠키 래핑) → 타입체크·빌드로 검증. 쿠키 어댑터는 Task 1 Step 2에서 확인한 시그니처를 따른다.

**Files:**
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/browser.ts`

- [ ] **Step 1: 서버 클라이언트 작성**

Create `apps/web/src/lib/supabase/server.ts`:
```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/env";

// SSR 서버 클라이언트 — 쿠키 기반 세션. RLS가 로그인 사용자 권한을 강제한다.
// Next 16: cookies()는 async.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트에서 set 호출 시 throw — proxy가 세션 갱신을 담당하므로 무시.
        }
      },
    },
  });
}
```

- [ ] **Step 2: 브라우저 클라이언트 작성**

Create `apps/web/src/lib/supabase/browser.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";

// 브라우저 클라이언트 — 사용자 세션 JWT로 Storage 직접 업로드(P3) 등에 사용.
// NEXT_PUBLIC_* 는 빌드 시 인라인된다.
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS (에러 0). `server-only` 미설치 에러 시 `pnpm --filter web add server-only` 후 재실행.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/supabase/server.ts apps/web/src/lib/supabase/browser.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): Supabase SSR 서버·브라우저 클라이언트"
```

---

## Task 4: 권한 가드 헬퍼

세션+프로필 권한을 읽어 `resolveAccess()`로 판정. 미인증→`/login` 리다이렉트, 통과/forbidden은 호출자(layout)가 분기.

**Files:**
- Create: `apps/web/src/lib/auth/guard.ts`

- [ ] **Step 1: 가드 작성**

Create `apps/web/src/lib/auth/guard.ts`:
```ts
import "server-only";
import { redirect } from "next/navigation";
import type { PermissionKey } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/auth/access";

// 세션+권한 서버 검증. 미인증이면 /login으로 리다이렉트(throw).
// 인증됐으나 권한 없으면 { status: "forbidden" } 반환 → layout이 403 렌더.
// ⚠️ Server Action은 직접 POST로도 도달 가능 → action에서도 이 가드를 재호출할 것.
export async function requirePermission(
  required: PermissionKey,
): Promise<
  | { status: "ok"; userId: string; permissions: string[] }
  | { status: "forbidden" }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login"); // never 반환 — 아래로 진행 안 함
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("permissions")
    .eq("id", user.id)
    .single();
  const permissions = profile?.permissions ?? null;

  const access = resolveAccess(user.id, permissions, required);
  if (access.status === "ok") {
    return { status: "ok", userId: user.id, permissions: permissions ?? [] };
  }
  return { status: "forbidden" };
}

export const requireEquipmentManage = () => requirePermission("equipment.manage");
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS. `redirect()` 후 `user` 좁혀짐(redirect 반환 타입 never).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth/guard.ts
git commit -m "feat(web): requirePermission 세션·권한 서버 가드"
```

---

## Task 5: proxy.ts — 세션 갱신 + /admin 가드

**Files:**
- Create: `apps/web/src/proxy.ts`

- [ ] **Step 1: proxy 작성**

Create `apps/web/src/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";

// Next 16: 구 middleware. 매 요청 세션 쿠키를 갱신하고, 미인증 /admin/* 접근을 /login으로.
// 권한(equipment.manage) 검증은 여기서 하지 않는다(layout·action이 DB로 강제).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // 정적 자산·이미지·favicon 제외, 나머지 전 경로에서 세션 갱신.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
```

- [ ] **Step 2: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. 빌드 로그에 proxy가 인식되는지 확인(에러 없으면 통과). 빌드에 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 필요 → 없으면 `.env.local`에 로컬 Supabase 값 주입 후 재시도.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/proxy.ts
git commit -m "feat(web): proxy 세션 갱신 + /admin 미인증 가드"
```

---

## Task 6: 로그인 — actions + page

**Files:**
- Create: `apps/web/src/app/login/actions.ts`
- Create: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Server Actions 작성**

Create `apps/web/src/app/login/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string } | null;

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }
  redirect("/admin/equipment");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: 로그인 폼 작성**

Create `apps/web/src/app/login/page.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    null,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 font-semibold text-text">재현테크 견적관리</h1>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-small text-muted">
          이메일
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          비밀번호
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
        </label>
        {state?.error ? (
          <p className="text-small text-danger">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
```
> 토큰 클래스(`text-h1`/`text-accent`/`text-danger` 등)는 Task 8에서 globals.css에 정의된다. 이 Task 후 Task 8 전까지는 스타일이 미적용일 수 있음(빌드는 통과).

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/login/actions.ts apps/web/src/app/login/page.tsx
git commit -m "feat(web): 로그인 페이지 + signIn/signOut 액션"
```

---

## Task 7: admin 셸 layout + equipment placeholder

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/equipment/page.tsx`

- [ ] **Step 1: 콘솔 셸 layout 작성 (권한 가드 + 403 분기)**

Create `apps/web/src/app/admin/layout.tsx`:
```tsx
import { requireEquipmentManage } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";

// 콘솔 셸 — 사이드바196 + 상단바. requireEquipmentManage가 미인증을 /login으로 보내고,
// 권한 없는 로그인 사용자는 403 패널을 렌더(AC2).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireEquipmentManage();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          장비 관리 권한(equipment.manage)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="w-[196px] shrink-0 border-r border-border bg-surface p-4">
        <p className="mb-4 text-small font-semibold text-muted">재현테크</p>
        <nav className="flex flex-col gap-1">
          <a
            href="/admin/equipment"
            className="rounded-md bg-surface-2 px-3 py-2 text-body font-medium text-text"
          >
            장비
          </a>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-small text-muted">장비 관리</span>
          <form action={signOut}>
            <button className="text-small text-muted hover:text-text">로그아웃</button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-[1140px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: equipment placeholder 페이지 작성**

Create `apps/web/src/app/admin/equipment/page.tsx`:
```tsx
// P2가 실제 목록(테이블·5-state)으로 교체. 지금은 가드 동작 확인용 placeholder.
export default function EquipmentListPage() {
  return (
    <section>
      <h1 className="text-h1 font-semibold text-text">장비</h1>
      <p className="mt-2 text-small text-muted">목록은 P2에서 구현됩니다.</p>
    </section>
  );
}
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/app/admin/equipment/page.tsx
git commit -m "feat(web): admin 콘솔 셸 + 권한 403 분기 + equipment placeholder"
```

---

## Task 8: 디자인 토큰 (globals.css ← DESIGN.md)

E2가 첫 실 UI → DESIGN.md 토큰을 Tailwind 4 `@theme`에 1회 확립(전 phase 재사용). 컴포넌트는 토큰만 참조.

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: 현재 globals.css 확인**

Run: `cat apps/web/src/app/globals.css`
Expected: Tailwind 4 스캐폴드(`@import "tailwindcss";` 등) 내용 파악.

- [ ] **Step 2: 토큰 정의로 교체**

`apps/web/src/app/globals.css` 내용을 아래로 작성(기존 `@import "tailwindcss";`는 유지하고 `@theme` 블록 추가):
```css
@import "tailwindcss";

/* 폰트 로드 — DESIGN.md: Pretendard(jsdelivr) + JetBrains Mono(Google) */
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css");
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap");

/* DESIGN.md 디자인 토큰 (industrial-clean, 북극성=명료함) */
@theme {
  --font-sans: "Pretendard", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* 브랜드/액센트 */
  --color-accent: #155e75;

  /* 중립(light) */
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-surface-2: #f1f5f9;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-muted: #64748b;

  /* 상태 — 장비 active/inactive + 신청 스파인(후속 phase) */
  --color-active: #16a34a;     /* 운영중 */
  --color-inactive: #64748b;   /* 비활성(=muted) */
  --color-danger: #dc2626;     /* 에러 */

  /* 타이포 스케일(px) — DESIGN.md */
  --text-display: 1.75rem;  /* 28 */
  --text-h1: 1.375rem;      /* 22 */
  --text-h2: 1.125rem;      /* 18 */
  --text-body: 0.875rem;    /* 14 */
  --text-small: 0.75rem;    /* 12 */
  --text-micro: 0.6875rem;  /* 11 */

  /* radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}
```
> ⚠️ Tailwind 4의 `@theme` 토큰명 규칙(`--color-*`→`bg-*`/`text-*`, `--text-*`→`text-*`)을 따른다. 토큰명이 유틸리티로 안 풀리면 `node_modules/tailwindcss` v4 docs 확인.

- [ ] **Step 3: 빌드로 토큰 유틸리티 생성 확인**

Run: `pnpm --filter web build`
Expected: PASS. Task 6/7에서 쓴 클래스(`text-accent`, `bg-surface`, `text-h1`, `text-danger`, `text-muted` 등)가 미정의 에러 없이 빌드.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): DESIGN.md 디자인 토큰 globals.css @theme 확립"
```

---

## Task 9: 통합 스모크 검증 (수동 + 게이트)

P1 산출이 동작하는지 로컬에서 확인. E2E(Playwright) 자동화는 P3 전체 플로우에서 도입.

- [ ] **Step 1: 로컬 Supabase + 시드 관리자 확인**

Run:
```bash
cd ~/Projects/jhtechSaaS
supabase status 2>/dev/null | head -5 || echo "supabase start 필요"
```
Expected: 로컬 가동 중. `.env.local`(apps/web)에 로컬 `NEXT_PUBLIC_SUPABASE_URL`(http://127.0.0.1:54321)·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정. 시드 관리자(admin@jhtech.local) 존재(E1 seed).

- [ ] **Step 2: 전체 게이트 통과 확인**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm --filter web build && pnpm --filter web test`
Expected: 모두 PASS.

- [ ] **Step 3: 수동 스모크 (문서화)**

Run: `pnpm --filter web dev` 후 브라우저에서:
1. `/admin/equipment` 접근(미로그인) → `/login` 리다이렉트되는가? (AC1)
2. `/login`에서 admin@jhtech.local 로그인 → `/admin/equipment` placeholder 노출되는가?
3. 권한 없는 계정(있다면)으로 로그인 → 403 패널 노출되는가? (AC2)
4. 로그아웃 → `/login`으로?

각 항목 결과를 기록. 실패 시 해당 Task로 돌아가 수정.

- [ ] **Step 4: P1 완료 커밋(있을 경우 .env.example 갱신)**

`.env.example`에 이미 supabase 키가 있으므로 추가 없음. 변경 없으면 스킵.

---

## P1 완료 기준

- [ ] `pnpm -r lint && typecheck && build && test` 통과
- [ ] resolveAccess 단위 테스트 5건 GREEN
- [ ] 미인증 `/admin/*` → `/login` (AC1, 수동 확인)
- [ ] 권한 없는 로그인 → 403 (AC2, 수동 확인)
- [ ] 로그인 → `/admin/equipment` 셸 노출
- [ ] 디자인 토큰 확립(전 phase 재사용 기반)
- [ ] service_role 키가 클라이언트 코드에 미유입(browser.ts는 anon만 사용)

→ 다음: **P2 장비 CRUD 코어** 계획 작성(types.specs 변경·목록 읽기·기본 폼·server actions).
