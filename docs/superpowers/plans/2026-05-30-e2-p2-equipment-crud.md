# E2 P2 — 장비 CRUD 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 관리자가 `/admin/equipment`에서 장비를 목록 조회하고 생성·수정·삭제한다(스칼라 필드 기준). 리치 에디터(사양·옵션·이미지)는 P3.

**Architecture:** Next 16 App Router 위에서 P1 인증 토대를 그대로 사용. 목록은 서버 컴포넌트가 SSR 서버 클라이언트로 읽고(loading/error는 라우트 컨벤션), 클라이언트 `EquipmentTable`이 검색·필터·5-state를 담당. 폼은 react-hook-form + zod(클라+서버 공유 스키마). 쓰기는 Server Actions로, 각 액션이 `requireEquipmentManage()`를 재검증(직접 POST 방어). RLS가 최종 강제.

**Tech Stack:** Next 16.2.6 · React 19 · @supabase/ssr · react-hook-form · @hookform/resolvers · zod 4 · Vitest 3 · packages/db-tests(pg RLS)

---

> 설계: `docs/superpowers/specs/2026-05-30-e2-equipment-admin-design.md` · 화면 계약: `UI-SPEC.md` · 토큰: `DESIGN.md` · 선행: P1(`...-p1-auth-foundation.md`, 완료)
> ⚠️ P1 산출 재사용: `requireEquipmentManage()`(@/lib/auth/guard), `createSupabaseServerClient()`(@/lib/supabase/server), 디자인 토큰(globals.css), admin 셸(layout).
> DB 사실: equipment(id uuid default gen_random_uuid, name not null, model/category null, base_price numeric, photos text[] default '{}', specs jsonb default '{}', youtube_url, status active/inactive). RLS select=authenticated(true), write=equipment.manage. **specs 컬럼 기본값은 '{}'이지만 앱은 항상 배열을 명시 write**(마이그레이션 없음).
> 범위 밖(P3): ImageUploader·SpecEditor·OptionEditor·고아 정리·E2E. P2 폼은 스칼라 필드만(specs=[]·photos=[]·옵션 없음으로 생성).

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/shared/src/types.ts` | Equipment/EquipmentPublic.specs → `Spec[]`, `Spec` 타입 |
| `packages/shared/src/specs.ts` (+test) | `parseSpecs`/`serializeSpecs` jsonb↔Spec[] 방어 변환 |
| `packages/shared/src/seed.ts` | minProdLength 8 이월(미커밋분 커밋) + stale 주석 정리 |
| `apps/web/src/app/layout.tsx` | lang="ko" + Geist 잔재 제거 (P1 리뷰 M1) |
| `apps/web/src/app/admin/page.tsx` | `/admin` → `/admin/equipment` 리다이렉트 (M4) |
| `apps/web/src/lib/equipment/schema.ts` (+test) | 장비 폼 zod 스키마(클라+서버 공유) |
| `apps/web/src/lib/equipment/queries.ts` | `listEquipment()` 서버 읽기 |
| `apps/web/src/app/admin/equipment/page.tsx` | 목록 서버 컴포넌트(fetch → Table) |
| `apps/web/src/app/admin/equipment/loading.tsx` | 스켈레톤(loading state) |
| `apps/web/src/app/admin/equipment/error.tsx` | 에러 바운더리(error state) |
| `apps/web/src/app/admin/equipment/actions.ts` | create/update/deleteEquipment Server Actions |
| `apps/web/src/app/admin/equipment/_components/EquipmentTable.tsx` | 목록·검색·필터·5-state·카드뷰 |
| `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` | RHF 스칼라 폼 |
| `apps/web/src/app/admin/equipment/new/page.tsx` | 생성 폼 페이지 |
| `apps/web/src/app/admin/equipment/[id]/edit/page.tsx` | 수정 폼 페이지(기존 로드) |
| `packages/db-tests/src/equipment-crud.test.ts` | equipment.manage 유무별 CRUD RLS |

---

## Task 1: shared — specs 타입 + 직렬화 헬퍼 (TDD)

DB의 jsonb specs를 도메인 `Spec[]`로 안전 변환. 레거시 `{}`(객체)·null도 빈 배열로 방어.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `packages/shared/src/specs.ts`
- Create: `packages/shared/src/specs.test.ts`
- Modify: `packages/shared/src/index.ts` (export specs)

- [ ] **Step 1: 실패 테스트** — Create `packages/shared/src/specs.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSpecs, serializeSpecs, type Spec } from "./specs";

describe("parseSpecs", () => {
  it("정상 배열을 그대로 반환", () => {
    const input = [{ label: "전압", value: "220V" }];
    expect(parseSpecs(input)).toEqual(input);
  });
  it("레거시 빈 객체 {}는 빈 배열로", () => {
    expect(parseSpecs({})).toEqual([]);
  });
  it("null/undefined는 빈 배열로", () => {
    expect(parseSpecs(null)).toEqual([]);
    expect(parseSpecs(undefined)).toEqual([]);
  });
  it("label/value 없는 항목은 제외", () => {
    expect(parseSpecs([{ label: "ok", value: "1" }, { foo: "bar" }])).toEqual([
      { label: "ok", value: "1" },
    ]);
  });
  it("label·value를 문자열로 강제", () => {
    expect(parseSpecs([{ label: 1, value: 2 }])).toEqual([
      { label: "1", value: "2" },
    ]);
  });
});

describe("serializeSpecs", () => {
  it("빈 항목(label·value 모두 공백)은 제거", () => {
    const input: Spec[] = [
      { label: "전압", value: "220V" },
      { label: "", value: "" },
    ];
    expect(serializeSpecs(input)).toEqual([{ label: "전압", value: "220V" }]);
  });
  it("label/value 트림", () => {
    expect(serializeSpecs([{ label: " 전압 ", value: " 220V " }])).toEqual([
      { label: "전압", value: "220V" },
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @jhtechsaas/shared test`
Expected: FAIL — `./specs` 모듈 없음.

- [ ] **Step 3: 구현** — Create `packages/shared/src/specs.ts`:
```ts
// 장비 사양 = 항목+값 행(순서 보존). DB는 jsonb, 도메인은 Spec[].
// /spec D2: 자유 입력. 카테고리 템플릿은 후속(#12).
export interface Spec {
  label: string;
  value: string;
}

// DB jsonb(any) → Spec[]. 레거시 {}·null·비정형 입력을 방어적으로 정규화.
export function parseSpecs(raw: unknown): Spec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({ label: String(r.label), value: String(r.value) }));
}

// Spec[] → DB 저장용. 빈 행 제거 + 트림(AC6: 순서 보존).
export function serializeSpecs(specs: Spec[]): Spec[] {
  return specs
    .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
    .filter((s) => s.label !== "" || s.value !== "");
}
```

- [ ] **Step 4: 타입 변경** — In `packages/shared/src/types.ts`: add `import type { Spec } from "./specs";` near the top imports, and change BOTH `specs: Record<string, unknown>;` (Equipment line ~27 and EquipmentPublic line ~40) to `specs: Spec[];`.

- [ ] **Step 5: export** — In `packages/shared/src/index.ts` add `export * from "./specs";` (alongside the other exports).

- [ ] **Step 6: 통과 + 타입체크** — Run: `pnpm --filter @jhtechsaas/shared test && pnpm --filter @jhtechsaas/shared typecheck`
Expected: specs 7 tests PASS, typecheck 0 errors. 다른 패키지가 깨지면 보고(grep 결과 types.ts만 specs 참조라 없을 것).

- [ ] **Step 7: Commit**
```bash
git add packages/shared/src/specs.ts packages/shared/src/specs.test.ts packages/shared/src/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): Equipment.specs를 Spec[]로 구체화 + 직렬화 헬퍼"
```

---

## Task 2: seed.ts 이월분 커밋 (P2 브랜치에 묶기)

설계 C: seed.ts `minProdLength=8` 변경(이미 작업트리에 미커밋)과 stale 테스트 주석 정리를 이 브랜치에 묶는다.

**Files:**
- Modify (이미 변경됨): `packages/shared/src/seed.ts`
- Possibly: `packages/shared/src/seed.test.ts` (stale 주석)

- [ ] **Step 1: 현 변경 확인** — Run: `git diff packages/shared/src/seed.ts`
현재 미커밋 변경(minProdLength 16→8 추정)을 확인. 의도와 맞는지 점검.

- [ ] **Step 2: stale 주석 정리** — `packages/shared/src/seed.test.ts`를 읽고, minProdLength 변경으로 더 이상 맞지 않는 주석/설명이 있으면 정리(테스트 로직은 GREEN 유지). 없으면 스킵.

- [ ] **Step 3: 테스트** — Run: `pnpm --filter @jhtechsaas/shared test`
Expected: seed.test 포함 전부 PASS.

- [ ] **Step 4: Commit**
```bash
git add packages/shared/src/seed.ts packages/shared/src/seed.test.ts
git commit -m "chore(shared): seed minProdLength 8 이월 + stale 주석 정리"
```
(seed.test.ts 변경 없으면 seed.ts만 add)

---

## Task 3: P1 리뷰 후속 (lang·Geist·admin 라우트)

P1 통합 리뷰의 저비용 후속(M1/M3/M4). 토대를 깔끔히.

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: layout 정리(M1)** — Read `apps/web/src/app/layout.tsx`. Geist `next/font` import·변수 적용을 제거하고 `<html lang="ko">`로. body className에서 Geist 변수 제거(globals.css가 Pretendard를 body에 이미 적용). metadata title은 "재현테크 견적관리"로.

- [ ] **Step 2: /admin 루트 리다이렉트(M4)** — Create `apps/web/src/app/admin/page.tsx`:
```tsx
import { redirect } from "next/navigation";

// /admin 직접 진입 → 기본 화면. (admin/layout 가드를 거친다)
export default function AdminIndex() {
  redirect("/admin/equipment");
}
```

- [ ] **Step 3: /login 인증 시 리다이렉트(M3)** — `apps/web/src/app/login/page.tsx`를 서버 컴포넌트 래퍼 + 클라이언트 폼으로 분리하거나, 폼은 그대로 두고 page를 서버 컴포넌트로 만들어 이미 로그인된 사용자를 리다이렉트. 권장 구조:
  - Rename current client form to `apps/web/src/app/login/LoginForm.tsx` ("use client", 기존 내용 그대로, default export `LoginForm`).
  - New `apps/web/src/app/login/page.tsx` (server component):
```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/admin/equipment");
  return <LoginForm />;
}
```

- [ ] **Step 4: 타입체크 + 빌드** — Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. 라우트에 `/admin`·`/login` 정상.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/admin/page.tsx apps/web/src/app/login/page.tsx apps/web/src/app/login/LoginForm.tsx
git commit -m "chore(web): lang=ko·Geist 제거 + /admin 리다이렉트 + /login 인증 가드"
```

---

## Task 4: 장비 폼 zod 스키마 + RHF deps (TDD)

클라이언트 검증과 서버 액션 검증이 공유하는 단일 스키마.

**Files:**
- Modify: `apps/web/package.json` (deps)
- Create: `apps/web/src/lib/equipment/schema.ts`
- Create: `apps/web/src/lib/equipment/schema.test.ts`

- [ ] **Step 1: deps 설치** — Run:
```bash
pnpm --filter web add react-hook-form @hookform/resolvers
```

- [ ] **Step 2: 실패 테스트** — Create `apps/web/src/lib/equipment/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { equipmentFormSchema } from "./schema";

const base = {
  name: "포장기 A",
  model: "PK-100",
  category: "포장",
  base_price: 1000000,
  status: "active" as const,
  youtube_url: "",
};

describe("equipmentFormSchema", () => {
  it("정상 입력 통과", () => {
    expect(equipmentFormSchema.safeParse(base).success).toBe(true);
  });
  it("name 빈값 거부", () => {
    expect(equipmentFormSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
  it("base_price 음수 거부", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, base_price: -1 }).success,
    ).toBe(false);
  });
  it("status는 active/inactive만", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, status: "foo" }).success,
    ).toBe(false);
  });
  it("youtube_url 빈 문자열 허용(선택)", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "" }).success,
    ).toBe(true);
  });
  it("youtube_url 잘못된 URL 거부", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "not a url" }).success,
    ).toBe(false);
  });
  it("model·category 선택(빈값 허용)", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, model: "", category: "" }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm --filter web test`
Expected: FAIL — `./schema` 없음.

- [ ] **Step 4: 구현** — Create `apps/web/src/lib/equipment/schema.ts`:
```ts
import { z } from "zod";

// 장비 폼 스키마 — 클라이언트(react-hook-form) 검증과 서버 액션 검증이 공유.
// 스칼라 필드만(P2). 사양·옵션·이미지는 P3에서 별도 처리.
export const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "장비명을 입력하세요"),
  model: z.string().trim().default(""),
  category: z.string().trim().default(""),
  base_price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
  status: z.enum(["active", "inactive"]),
  // 선택값: 빈 문자열 허용, 값이 있으면 URL 형식.
  youtube_url: z
    .union([z.literal(""), z.string().url("유효한 YouTube 링크가 아닙니다")])
    .default(""),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
```

- [ ] **Step 5: 통과 + 타입체크** — Run: `pnpm --filter web test && pnpm --filter web typecheck`
Expected: schema 7 tests PASS(+ 기존 access 5 = 12), typecheck 0 errors. zod 4의 `.url()`/`.enum()`/`message` API가 다르면 보고 후 조정(캐스팅 금지).

- [ ] **Step 6: Commit**
```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/equipment/schema.ts apps/web/src/lib/equipment/schema.test.ts
git commit -m "feat(web): 장비 폼 zod 스키마 + react-hook-form 도입"
```

---

## Task 5: 장비 목록 읽기 + 라우트 상태(loading/error)

**Files:**
- Create: `apps/web/src/lib/equipment/queries.ts`
- Modify: `apps/web/src/app/admin/equipment/page.tsx` (placeholder → 실제)
- Create: `apps/web/src/app/admin/equipment/loading.tsx`
- Create: `apps/web/src/app/admin/equipment/error.tsx`

- [ ] **Step 1: 읽기 헬퍼** — Create `apps/web/src/lib/equipment/queries.ts`:
```ts
import "server-only";
import type { Equipment } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 장비 전량 읽기(최신순). RLS: 로그인 스태프 읽기 허용. 페이지네이션 없음(P2 결정).
export async function listEquipment(): Promise<Equipment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    specs: parseSpecs(row.specs),
  })) as Equipment[];
}
```

- [ ] **Step 2: 목록 페이지(서버)** — Replace `apps/web/src/app/admin/equipment/page.tsx`:
```tsx
import Link from "next/link";
import { listEquipment } from "@/lib/equipment/queries";
import { EquipmentTable } from "./_components/EquipmentTable";

// 서버 컴포넌트 — 전량 fetch 후 클라이언트 테이블에 전달(검색·필터·5-state는 거기서).
export default async function EquipmentListPage() {
  const items = await listEquipment();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        <Link
          href="/admin/equipment/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 장비
        </Link>
      </div>
      <EquipmentTable items={items} />
    </section>
  );
}
```

- [ ] **Step 3: loading 스켈레톤** — Create `apps/web/src/app/admin/equipment/loading.tsx`:
```tsx
// 목록 로딩 — 테이블 스켈레톤(UI-SPEC: loading state).
export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        <div className="h-9 w-24 rounded-md bg-surface-2" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded-md bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: error 바운더리** — Create `apps/web/src/app/admin/equipment/error.tsx`:
```tsx
"use client";
// 목록 조회 실패 — 재시도(UI-SPEC: error state).
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
      <p className="text-h2 font-semibold text-text">목록을 불러오지 못했습니다</p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </section>
  );
}
```

- [ ] **Step 5: EquipmentTable 생성** — Create `apps/web/src/app/admin/equipment/_components/EquipmentTable.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Equipment } from "@jhtechsaas/shared";

type StatusFilter = "all" | "active" | "inactive";

// 금액 포맷(mono tabular는 클래스로). 천단위 콤마 + ₩.
function formatPrice(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

const STATUS_BADGE: Record<Equipment["status"], { label: string; cls: string }> = {
  active: { label: "운영중", cls: "bg-active/10 text-active" },
  inactive: { label: "비활성", cls: "bg-surface-2 text-muted" },
};

export function EquipmentTable({ items }: { items: Equipment[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.name.toLowerCase().includes(needle) ||
        (it.model ?? "").toLowerCase().includes(needle);
      const matchesStatus = status === "all" || it.status === status;
      return matchesQ && matchesStatus;
    });
  }, [items, q, status]);

  // empty: 카탈로그 자체가 비어있음(첫 사용)
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 장비가 없습니다</p>
        <p className="text-small text-muted">첫 장비를 추가해 카탈로그를 시작하세요</p>
        <Link
          href="/admin/equipment/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 장비
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·모델 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                status === s ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {s === "all" ? "전체" : s === "active" ? "운영중" : "비활성"}
            </button>
          ))}
        </div>
      </div>

      {/* partial: 데이터는 있으나 필터 결과 0건 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 장비가 없습니다</p>
          <button
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
            className="text-small text-accent underline"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-border text-left text-small text-muted">
              <th className="w-12 py-2"></th>
              <th className="py-2 font-medium">이름</th>
              <th className="py-2 font-medium">모델</th>
              <th className="py-2 font-medium">분류</th>
              <th className="py-2 text-right font-medium">기본가</th>
              <th className="py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const badge = STATUS_BADGE[it.status];
              return (
                <tr
                  key={it.id}
                  className="border-b border-border hover:bg-surface-2"
                >
                  <td className="py-2">
                    {it.photos[0] ? (
                      <Image
                        src={it.photos[0]}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-sm object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-sm bg-surface-2" />
                    )}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/admin/equipment/${it.id}/edit`}
                      className="font-medium text-text hover:text-accent"
                    >
                      {it.name}
                    </Link>
                  </td>
                  <td className="py-2 font-mono text-text">{it.model ?? "-"}</td>
                  <td className="py-2 text-muted">{it.category ?? "-"}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-text">
                    {formatPrice(it.base_price)}
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-small font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 6: next/image 원격 호스트 허용** — `apps/web/next.config.ts`(또는 .js/.mjs)를 읽고, Supabase Storage 공개 URL을 next/image가 허용하도록 `images.remotePatterns`에 Supabase 호스트를 추가. 예(호스트는 .env.local의 NEXT_PUBLIC_SUPABASE_URL 기준):
```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "*.supabase.co" },
    { protocol: "http", hostname: "127.0.0.1" },
  ],
},
```
> P2 폼은 사진을 안 올리므로 목록에 이미지가 없을 수 있으나, placeholder div 폴백이 있어 무방. remotePatterns는 P3 대비 미리 설정.

- [ ] **Step 7: 타입체크 + 빌드** (목록 일괄 검증 — 이 시점에 Table·page·라우트가 모두 존재해 빌드 통과)
Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. `/admin/equipment` 라우트 정상.

- [ ] **Step 8: Commit** (목록 일체를 한 커밋으로 — 빌드 통과 상태)
```bash
git add apps/web/src/lib/equipment/queries.ts apps/web/src/app/admin/equipment/page.tsx apps/web/src/app/admin/equipment/loading.tsx apps/web/src/app/admin/equipment/error.tsx apps/web/src/app/admin/equipment/_components/EquipmentTable.tsx apps/web/next.config.ts
git commit -m "feat(web): 장비 목록(읽기·Table·5-state·loading/error) + next/image 호스트"
```
(next.config 파일명은 실제 확장자에 맞춰 add)

---

## Task 6: 쓰기 Server Actions (create/update/delete)

각 액션이 `requireEquipmentManage()`로 권한 재검증 후 zod 재검증 → supabase 쓰기 → revalidate/redirect.

**Files:**
- Create: `apps/web/src/app/admin/equipment/actions.ts`

- [ ] **Step 1: 구현** — Create `apps/web/src/app/admin/equipment/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEquipmentManage } from "@/lib/auth/guard";
import { equipmentFormSchema, type EquipmentFormValues } from "@/lib/equipment/schema";

// 쓰기 공통 결과 타입. 폼은 에러 메시지를 inline 노출.
export type EquipmentActionResult = { error: string } | null;

// 생성. id는 클라가 생성(P3 이미지 경로 안정화 대비)해 전달.
export async function createEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const parsed = equipmentFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment").insert({
    id,
    name: v.name,
    model: v.model || null,
    category: v.category || null,
    base_price: v.base_price,
    status: v.status,
    youtube_url: v.youtube_url || null,
    specs: [], // P3 SpecEditor에서 채움
    photos: [], // P3 ImageUploader에서 채움
  });
  if (error) return { error: `저장하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

// 수정. specs·photos는 P2에서 건드리지 않음(P3 담당) → 스칼라 필드만 갱신.
export async function updateEquipment(
  id: string,
  values: EquipmentFormValues,
): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const parsed = equipmentFormSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name: v.name,
      model: v.model || null,
      category: v.category || null,
      base_price: v.base_price,
      status: v.status,
      youtube_url: v.youtube_url || null,
    })
    .eq("id", id);
  if (error) return { error: `저장하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}

// 삭제.
export async function deleteEquipment(id: string): Promise<EquipmentActionResult> {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return { error: `삭제하지 못했습니다: ${error.message}` };

  revalidatePath("/admin/equipment");
  redirect("/admin/equipment");
}
```
> `.eq("id", id)`는 RLS 안전망(설계). equipment_option은 FK on delete cascade라 P2 삭제 시 자동 정리. Storage 이미지 정리는 P3.

- [ ] **Step 2: 타입체크** — Run: `pnpm --filter web typecheck`
Expected: PASS. redirect()는 never라 반환 경로 문제 없음.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/admin/equipment/actions.ts
git commit -m "feat(web): 장비 create/update/delete Server Actions(권한 재검증)"
```

---

## Task 7: EquipmentForm + new/edit 페이지

**Files:**
- Create: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`
- Create: `apps/web/src/app/admin/equipment/new/page.tsx`
- Create: `apps/web/src/app/admin/equipment/[id]/edit/page.tsx`

- [ ] **Step 1: 폼 컴포넌트** — Create `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  equipmentFormSchema,
  type EquipmentFormValues,
} from "@/lib/equipment/schema";
import {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentActionResult,
} from "../actions";

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; initial: EquipmentFormValues };

export function EquipmentForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues:
      props.mode === "edit"
        ? props.initial
        : {
            name: "",
            model: "",
            category: "",
            base_price: 0,
            status: "active",
            youtube_url: "",
          },
  });

  function onSubmit(values: EquipmentFormValues) {
    setServerError(null);
    startTransition(async () => {
      let result: EquipmentActionResult;
      if (props.mode === "create") {
        result = await createEquipment(crypto.randomUUID(), values);
      } else {
        result = await updateEquipment(props.id, values);
      }
      // 성공 시 액션이 redirect하므로 여기 도달은 에러 케이스.
      if (result?.error) setServerError(result.error);
    });
  }

  function onDelete() {
    if (props.mode !== "edit") return;
    if (!confirm("이 장비를 삭제할까요?")) return;
    startTransition(async () => {
      const result = await deleteEquipment(props.id);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-[720px] flex-col gap-5"
    >
      <Field label="장비명" error={errors.name?.message}>
        <input
          {...register("name")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>
      <Field label="모델" error={errors.model?.message}>
        <input
          {...register("model")}
          className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-body text-text"
        />
      </Field>
      <Field label="분류" error={errors.category?.message}>
        <input
          {...register("category")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>
      <Field label="기본가(₩)" error={errors.base_price?.message}>
        <input
          type="number"
          min={0}
          {...register("base_price", { valueAsNumber: true })}
          className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
        />
      </Field>
      <Field label="상태" error={errors.status?.message}>
        <select
          {...register("status")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        >
          <option value="active">운영중</option>
          <option value="inactive">비활성</option>
        </select>
      </Field>
      <Field label="YouTube URL(선택)" error={errors.youtube_url?.message}>
        <input
          {...register("youtube_url")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>

      {serverError ? (
        <p className="text-small text-danger">{serverError}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/equipment")}
          className="text-small text-muted hover:text-text"
        >
          취소
        </button>
        {props.mode === "edit" ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="ml-auto text-small text-danger hover:underline"
          >
            삭제
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-small text-muted">{label}</span>
      {children}
      {error ? <span className="text-micro text-danger">{error}</span> : null}
    </label>
  );
}
```

- [ ] **Step 2: 생성 페이지** — Create `apps/web/src/app/admin/equipment/new/page.tsx`:
```tsx
import { EquipmentForm } from "../_components/EquipmentForm";

export default function NewEquipmentPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 추가</h1>
      <EquipmentForm mode="create" />
    </section>
  );
}
```

- [ ] **Step 3: 수정 페이지** — Create `apps/web/src/app/admin/equipment/[id]/edit/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EquipmentForm } from "../../_components/EquipmentForm";
import type { EquipmentFormValues } from "@/lib/equipment/schema";

// Next 16: params는 Promise.
export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("name, model, category, base_price, status, youtube_url")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const initial: EquipmentFormValues = {
    name: data.name,
    model: data.model ?? "",
    category: data.category ?? "",
    base_price: Number(data.base_price),
    status: data.status,
    youtube_url: data.youtube_url ?? "",
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 수정</h1>
      <EquipmentForm mode="edit" id={id} initial={initial} />
    </section>
  );
}
```

- [ ] **Step 4: 타입체크 + 빌드** — Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. 라우트에 `/admin/equipment/new`·`/admin/equipment/[id]/edit` 노출.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx apps/web/src/app/admin/equipment/new/page.tsx "apps/web/src/app/admin/equipment/[id]/edit/page.tsx"
git commit -m "feat(web): EquipmentForm + 생성·수정 페이지(RHF·삭제)"
```

---

## Task 8: equipment CRUD RLS 통합 테스트

E1 db-tests 하니스(pg set role + jwt claims) 재사용. equipment.manage 유무별 쓰기 차단 검증.

**Files:**
- Create: `packages/db-tests/src/equipment-crud.test.ts`

- [ ] **Step 1: 기존 하니스 패턴 확인** — Read `packages/db-tests/src/equipment.test.ts` (E1)로 헬퍼·설정(로컬 pg 접속, set role, request.jwt.claims 주입, 시드 UID) 패턴을 파악. 동일 패턴을 따른다.

- [ ] **Step 2: 테스트 작성** — Create `packages/db-tests/src/equipment-crud.test.ts`. 기존 equipment.test.ts의 import·셋업 헬퍼를 그대로 사용해 다음을 단언(정확한 헬퍼명은 Step 1에서 확인해 맞춘다):
  - equipment.manage 보유 사용자로 set role/jwt → equipment INSERT 성공, UPDATE 성공, DELETE 성공.
  - equipment.manage 미보유 로그인 사용자 → INSERT/UPDATE/DELETE가 RLS로 차단(0 rows / 에러).
  - 미인증(anon) → equipment SELECT 0건(원본 비공개), equipment_public은 active만 노출.
  각 테스트 후 생성 행을 정리(트랜잭션 롤백 또는 명시 delete, 기존 하니스 관례에 맞춤).

- [ ] **Step 3: 실행** — Run: `pnpm --filter @jhtechsaas/db-tests test:rls` (사전 `supabase start` 필요 — 이미 가동 중).
Expected: 신규 테스트 PASS. 기존 RLS 테스트도 GREEN 유지.

- [ ] **Step 4: Commit**
```bash
git add packages/db-tests/src/equipment-crud.test.ts
git commit -m "test(db): equipment CRUD RLS — equipment.manage 유무별 쓰기 차단"
```

---

## Task 9: 통합 게이트 검증

- [ ] **Step 1: 전체 게이트** — Run: `pnpm -r lint && pnpm -r typecheck && pnpm --filter web build && pnpm -r test`
Expected: 모두 PASS.

- [ ] **Step 2: 수동 스모크(문서화)** — `pnpm --filter web dev` 후 admin@jhtech.local 로그인:
  1. `/admin/equipment` empty 상태 노출(장비 0건) → "등록된 장비가 없습니다".
  2. + 새 장비 → name+가격 입력 → 저장 → 목록에 노출(AC3 일부, 사진 없이).
  3. 행 클릭 → 수정 → status=비활성 토글 → 저장 → 배지 변경.
  4. 검색/필터 → partial(0건) 상태 확인.
  5. 삭제 → 목록에서 제거.
  결과 기록.

- [ ] **Step 3: AC5 부분 검증** — inactive로 바꾼 장비가 `equipment_public` 뷰에서 빠지는지 확인(Studio SQL 또는 REST). 가격·옵션 비노출 유지.

## P2 완료 기준

- [ ] lint·typecheck·build·test 전부 GREEN
- [ ] specs Spec[] 타입 + 직렬화 단위 테스트 / 폼 zod 스키마 단위 테스트
- [ ] equipment CRUD RLS 통합 테스트(권한별)
- [ ] 목록 5-state(empty/partial/populated + loading/error 라우트)
- [ ] 생성·수정·삭제 동작(스칼라), 권한 없는 사용자 차단
- [ ] AC5: inactive → equipment_public 제외
- [ ] seed.ts 이월분 커밋됨(작업트리 clean)

→ 다음: **P3** — ImageUploader(직접 업로드·순서·대표)·SpecEditor·OptionEditor·고아 정리·Playwright E2E(AC1~8 자동).
