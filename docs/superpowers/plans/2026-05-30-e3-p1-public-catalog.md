# E3 P1 — 공개 장비 카탈로그·상세 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인(anon) 고객이 `/equipment` 카탈로그에서 active 장비를 보고 `/equipment/[id]` 상세(사진·스펙·YouTube)를 SEO·반응형으로 확인하는 읽기전용 공개 surface를 구현한다.

**Architecture:** 동적 SSR 서버컴포넌트가 `equipment_public` 뷰(active만·가격/옵션 비노출)를 anon으로 읽고, presentational 컴포넌트로 렌더한다. SEO는 per-equipment `generateMetadata` + 동적 `sitemap.ts`/`robots.ts`. 순수 로직(youtube id 파싱·메타·sitemap 빌드·site URL)은 Vitest 단위 테스트, 렌더 동작은 Playwright E2E로 검증한다.

**Tech Stack:** Next 16(App Router, `params`=Promise) · React 19 · Tailwind 4(@theme 토큰) · @supabase/ssr · Vitest(node) · Playwright.

**설계 문서:** `docs/superpowers/specs/2026-05-30-e3-public-catalog-design.md` (이 PLAN은 그 §2~§6 = P1을 구현).

---

## 사전 확인 (코드 변경 아님 — 첫 태스크 전 1회)

- `apps/web/src/proxy.ts`는 미인증 리다이렉트를 **`/admin`** 경로에만 적용하므로 공개 라우트(`/`, `/equipment`, `/equipment/[id]`)는 그대로 통과한다 → **proxy 변경 불필요**. (단, proxy가 모든 매칭 경로에 `Cache-Control: private, no-store`를 실어 공개 페이지가 CDN 캐시되지 않음. P1 범위에선 동적 SSR이라 기능상 무방. 캐시 최적화는 후속.)
- `equipment_public` RLS(anon이 active만·`base_price` 미노출)는 `packages/db-tests/src/equipment.test.ts`에 **이미 테스트됨** → P1은 신규 RLS 테스트 불필요. 렌더 동작은 Task 10 E2E가 커버.

---

## File Structure (P1)

**순수 로직 (Vitest 단위 — `src/**/*.test.ts`):**
- `apps/web/src/lib/seo/site.ts` — site 절대 URL 해석(metadataBase·OG·sitemap 베이스).
- `apps/web/src/lib/equipment/youtube.ts` — youtube_url → embed id 파싱·임베드 URL.
- `apps/web/src/lib/seo/equipment-meta.ts` — 상세 페이지 `Metadata` 빌더(절대 OG URL).
- `apps/web/src/lib/seo/sitemap-entries.ts` — sitemap 엔트리 빌더.

**서버 데이터 (server-only, DB — E2E/빌드로 검증):**
- `apps/web/src/lib/equipment/public-queries.ts` — `listPublicEquipment()` / `getPublicEquipment(id)`.

**라우트·컴포넌트 (렌더 — E2E로 검증):**
- `apps/web/src/app/_components/CatalogButton.tsx` — 재사용 CTA.
- `apps/web/src/app/page.tsx` — 홈(미니멀, 보일러플 교체).
- `apps/web/src/app/equipment/page.tsx` — 카탈로그 목록.
- `apps/web/src/app/equipment/_components/EquipmentCard.tsx` — 카드.
- `apps/web/src/app/equipment/loading.tsx` · `error.tsx` — 공개 그룹 상태.
- `apps/web/src/app/equipment/[id]/page.tsx` — 상세 + `generateMetadata`.
- `apps/web/src/app/equipment/[id]/_components/PublicGallery.tsx` — 사진 갤러리(client).
- `apps/web/src/app/equipment/[id]/_components/SpecTable.tsx` — 사양 테이블.
- `apps/web/src/app/equipment/[id]/_components/YoutubeEmbed.tsx` — 영상 임베드.
- `apps/web/src/app/sitemap.ts` · `apps/web/src/app/robots.ts`.

**수정:**
- `apps/web/src/env.ts` — `NEXT_PUBLIC_SITE_URL`(optional) 추가.
- `.env.example` — 동일 변수 추가.
- `apps/web/src/app/layout.tsx` — `metadataBase` + title template.
- `apps/web/e2e/public-catalog.spec.ts` — 신규 E2E.
- `UI-SPEC.md` — 공개 카탈로그·상세 화면계약 추가.

**디자인 토큰(globals.css @theme):** `bg-bg`/`bg-surface`/`bg-surface-2`/`border-border`/`text-text`/`text-muted`/`text-accent`/`bg-accent`/`text-display`/`text-h1`/`text-h2`/`text-body`/`text-small`/`font-mono`/`rounded-sm`/`rounded-md`.

---

## Task 1: `NEXT_PUBLIC_SITE_URL` env + `site.ts` 헬퍼

**Files:**
- Create: `apps/web/src/lib/seo/site.ts`
- Test: `apps/web/src/lib/seo/site.test.ts`
- Modify: `apps/web/src/env.ts`, `.env.example`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/seo/site.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("값이 있으면 끝 슬래시 제거 후 반환", () => {
    expect(resolveSiteUrl("https://jhtech.example.com/")).toBe("https://jhtech.example.com");
    expect(resolveSiteUrl("https://jhtech.example.com")).toBe("https://jhtech.example.com");
  });
  it("빈 값·undefined면 기본값(localhost:3000)", () => {
    expect(resolveSiteUrl(undefined)).toBe("http://localhost:3000");
    expect(resolveSiteUrl("   ")).toBe("http://localhost:3000");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/site.test.ts`
Expected: FAIL — `Cannot find module './site'`.

- [ ] **Step 3: 구현**

`apps/web/src/lib/seo/site.ts`:
```ts
// 사이트 절대 URL 베이스(metadataBase·OG·sitemap). NEXT_PUBLIC_SITE_URL 미설정 시 로컬 기본값.
// 주의: 모듈 로드 시점(layout metadata) 안전을 위해 getPublicEnv(필수 supabase 변수 parse) 대신
// process.env를 직접 읽는다. NEXT_PUBLIC_* 는 Next 빌드 시 인라인되어 서버·클라 모두 사용 가능.
const DEFAULT_SITE_URL = "http://localhost:3000";

export function resolveSiteUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return DEFAULT_SITE_URL;
  return v.replace(/\/+$/, "");
}

export function siteUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/site.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: env 스키마·예시 갱신 (글로벌 규칙: env 추가 시 .env.example + Zod 동시)**

`apps/web/src/env.ts` — `publicEnvSchema`에 추가:
```ts
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().optional(), // 공개 사이트 절대 URL(메타·sitemap). 미설정 시 site.ts 기본값.
});
```
같은 파일 `getPublicEnv()` 반환 객체에 추가:
```ts
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```

`.env.example` — Supabase 공개 블록 아래에 추가:
```bash
# === 공개 사이트 절대 URL (SEO 메타·sitemap·OG, 선택) ===
# 미설정 시 http://localhost:3000. 프로덕션은 Vercel에 https://<도메인> 설정.
NEXT_PUBLIC_SITE_URL=https://jhtech.example.com
```

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/seo/site.ts apps/web/src/lib/seo/site.test.ts apps/web/src/env.ts .env.example
git commit -m "feat(web): 공개 사이트 URL 헬퍼 + NEXT_PUBLIC_SITE_URL env (E3 P1)"
```

---

## Task 2: YouTube embed id 파싱 헬퍼

**Files:**
- Create: `apps/web/src/lib/equipment/youtube.ts`
- Test: `apps/web/src/lib/equipment/youtube.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/equipment/youtube.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseYoutubeId, youtubeEmbedUrl } from "./youtube";

describe("parseYoutubeId", () => {
  it("watch?v= 형식", () => {
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("youtu.be 단축", () => {
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("/embed/·/shorts/ 형식", () => {
    expect(parseYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("null·빈문자·비유튜브·잘못된 id → null", () => {
    expect(parseYoutubeId(null)).toBeNull();
    expect(parseYoutubeId("")).toBeNull();
    expect(parseYoutubeId("https://example.com/watch?v=abc")).toBeNull();
    expect(parseYoutubeId("not a url")).toBeNull();
    expect(parseYoutubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  it("nocookie 임베드 URL", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/equipment/youtube.test.ts`
Expected: FAIL — `Cannot find module './youtube'`.

- [ ] **Step 3: 구현**

`apps/web/src/lib/equipment/youtube.ts`:
```ts
// youtube_url → 임베드 id 추출(순수). 지원: watch?v=, youtu.be/, /embed/, /shorts/.
// id는 정확히 11자 [A-Za-z0-9_-]. 형식 외·null이면 null. (DB의 youtube_url은 E2에서 호스트 제한됨 — 방어적 재검증.)
const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.slice(1);
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/embed/")) id = u.pathname.slice("/embed/".length);
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.slice("/shorts/".length);
  }
  if (id) id = id.split("/")[0];
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function youtubeEmbedUrl(id: string): string {
  // privacy-enhanced 도메인(youtube-nocookie).
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/equipment/youtube.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/equipment/youtube.ts apps/web/src/lib/equipment/youtube.test.ts
git commit -m "feat(web): youtube_url→embed id 파싱 헬퍼 (E3 P1)"
```

---

## Task 3: 상세 페이지 Metadata 빌더

**Files:**
- Create: `apps/web/src/lib/seo/equipment-meta.ts`
- Test: `apps/web/src/lib/seo/equipment-meta.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/seo/equipment-meta.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { buildEquipmentDescription, buildEquipmentMetadata } from "./equipment-meta";

const base: EquipmentPublic = {
  id: "eq-1",
  name: "전자동 포장기",
  model: "PK-200",
  category: "포장기",
  photos: ["equipment/eq-1/cover.jpg"],
  specs: [
    { label: "전압", value: "220V" },
    { label: "출력", value: "3kW" },
    { label: "무게", value: "120kg" },
  ],
  youtube_url: null,
  created_at: "2026-05-30T00:00:00Z",
};

describe("buildEquipmentDescription", () => {
  it("카테고리·모델·대표 스펙 2개를 한 줄로", () => {
    expect(buildEquipmentDescription(base)).toBe(
      "전자동 포장기 — 포장기 · PK-200 · 전압 220V · 출력 3kW",
    );
  });
  it("부가정보 없으면 기본 문구", () => {
    const bare = { ...base, model: null, category: null, specs: [] };
    expect(buildEquipmentDescription(bare)).toBe("전자동 포장기 상세 정보");
  });
});

describe("buildEquipmentMetadata", () => {
  it("title·canonical·OG(절대 이미지 URL)", () => {
    const m = buildEquipmentMetadata(base, "https://jh.example.com", "https://x.supabase.co");
    expect(m.title).toBe("전자동 포장기");
    expect(m.alternates?.canonical).toBe("https://jh.example.com/equipment/eq-1");
    expect(m.openGraph?.images).toEqual([
      "https://x.supabase.co/storage/v1/object/public/equipment-images/equipment/eq-1/cover.jpg",
    ]);
  });
  it("사진 0장이면 OG 이미지 빈 배열", () => {
    const m = buildEquipmentMetadata({ ...base, photos: [] }, "https://jh.example.com", "https://x.supabase.co");
    expect(m.openGraph?.images).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/equipment-meta.test.ts`
Expected: FAIL — `Cannot find module './equipment-meta'`.

- [ ] **Step 3: 구현**

`apps/web/src/lib/seo/equipment-meta.ts`:
```ts
import type { Metadata } from "next";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { buildPublicImageUrl } from "@/lib/equipment/images";

const COMPANY = "(주)재현테크";

// 상세 description: 카테고리·모델·대표 스펙(최대 2) 한 줄. 부가정보 없으면 기본 문구.
export function buildEquipmentDescription(eq: EquipmentPublic): string {
  const parts: string[] = [];
  if (eq.category) parts.push(eq.category);
  if (eq.model) parts.push(eq.model);
  for (const s of eq.specs.slice(0, 2)) {
    if (s.label && s.value) parts.push(`${s.label} ${s.value}`);
  }
  const detail = parts.join(" · ");
  return detail ? `${eq.name} — ${detail}` : `${eq.name} 상세 정보`;
}

// 장비 상세 Metadata. siteUrl·supabaseUrl 주입(순수성·테스트 용이). OG 이미지는 절대 URL.
export function buildEquipmentMetadata(
  eq: EquipmentPublic,
  siteUrl: string,
  supabaseUrl: string,
): Metadata {
  const description = buildEquipmentDescription(eq);
  const images = eq.photos.length
    ? [buildPublicImageUrl(supabaseUrl, eq.photos[0])]
    : [];
  return {
    title: eq.name,
    description,
    alternates: { canonical: `${siteUrl}/equipment/${eq.id}` },
    openGraph: {
      title: `${eq.name} | ${COMPANY}`,
      description,
      url: `${siteUrl}/equipment/${eq.id}`,
      images,
      type: "website",
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/equipment-meta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/seo/equipment-meta.ts apps/web/src/lib/seo/equipment-meta.test.ts
git commit -m "feat(web): 장비 상세 SEO Metadata 빌더 (E3 P1)"
```

---

## Task 4: sitemap 엔트리 빌더

**Files:**
- Create: `apps/web/src/lib/seo/sitemap-entries.ts`
- Test: `apps/web/src/lib/seo/sitemap-entries.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/seo/sitemap-entries.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSitemapEntries } from "./sitemap-entries";

describe("buildSitemapEntries", () => {
  it("정적 경로(/, /equipment) + 장비 상세를 절대 URL로", () => {
    const e = buildSitemapEntries(["a1", "b2"], "https://jh.example.com");
    expect(e.map((x) => x.url)).toEqual([
      "https://jh.example.com/",
      "https://jh.example.com/equipment",
      "https://jh.example.com/equipment/a1",
      "https://jh.example.com/equipment/b2",
    ]);
  });
  it("장비 없으면 정적 경로만", () => {
    const e = buildSitemapEntries([], "https://jh.example.com");
    expect(e).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/sitemap-entries.test.ts`
Expected: FAIL — `Cannot find module './sitemap-entries'`.

- [ ] **Step 3: 구현**

`apps/web/src/lib/seo/sitemap-entries.ts`:
```ts
import type { MetadataRoute } from "next";

// 동적 sitemap 엔트리(순수). 정적 경로 + active 장비 상세. URL은 절대.
export function buildSitemapEntries(
  equipmentIds: string[],
  siteUrl: string,
): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/equipment`, changeFrequency: "weekly", priority: 0.8 },
  ];
  const detail: MetadataRoute.Sitemap = equipmentIds.map((id) => ({
    url: `${siteUrl}/equipment/${id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  return [...staticEntries, ...detail];
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter web exec vitest run src/lib/seo/sitemap-entries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/seo/sitemap-entries.ts apps/web/src/lib/seo/sitemap-entries.test.ts
git commit -m "feat(web): sitemap 엔트리 빌더 (E3 P1)"
```

---

## Task 5: 공개 쿼리 레이어 (`public-queries.ts`)

DB 의존이라 단위 테스트 대신 빌드·E2E(Task 10)로 검증. `listEquipment`(`queries.ts`) 패턴을 그대로 따른다.

**Files:**
- Create: `apps/web/src/lib/equipment/public-queries.ts`

- [ ] **Step 1: 구현**

`apps/web/src/lib/equipment/public-queries.ts`:
```ts
import "server-only";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// equipment_public 뷰 = active만, 가격·옵션 비노출. anon 읽기(세션 없으면 anon role).
const PUBLIC_COLUMNS = "id, name, model, category, photos, specs, youtube_url, created_at";

// 공개 카탈로그 목록(최신순).
export async function listPublicEquipment(): Promise<EquipmentPublic[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_public")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`공개 장비 목록 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...row,
    specs: parseSpecs(row.specs),
  })) as EquipmentPublic[];
}

// 공개 장비 단건. 없거나 inactive면 null(뷰가 active만 노출하므로 자동).
export async function getPublicEquipment(id: string): Promise<EquipmentPublic | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment_public")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`공개 장비 조회 실패: ${error.message}`);
  if (!data) return null;
  return { ...data, specs: parseSpecs(data.specs) } as EquipmentPublic;
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/equipment/public-queries.ts
git commit -m "feat(web): equipment_public 공개 쿼리 레이어 (E3 P1)"
```

---

## Task 6: 재사용 CatalogButton + 홈 페이지

**Files:**
- Create: `apps/web/src/app/_components/CatalogButton.tsx`
- Modify(전체 교체): `apps/web/src/app/page.tsx`

- [ ] **Step 1: CatalogButton 구현**

`apps/web/src/app/_components/CatalogButton.tsx`:
```tsx
import Link from "next/link";

// 재사용 CTA — 홈/추후 랜딩에서 카탈로그로 유도. accent 버튼(DESIGN.md).
export function CatalogButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/equipment"
      className={`inline-flex items-center justify-center rounded-md bg-accent px-5 py-3 text-body font-medium text-white ${className}`}
    >
      장비 카탈로그 보기
    </Link>
  );
}
```

- [ ] **Step 2: 홈 페이지 교체 (Next 보일러플 제거)**

`apps/web/src/app/page.tsx` (전체 내용 교체):
```tsx
import { CatalogButton } from "./_components/CatalogButton";

// 공개 홈 — 미니멀(회사 한 줄 + 카탈로그 CTA). 정식 랜딩은 후속 이슈.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <h1 className="text-display font-semibold text-text">(주)재현테크</h1>
      <p className="max-w-md text-body text-muted">
        포장·자동화 장비 견적을 온라인으로 간편하게 요청하세요.
      </p>
      <CatalogButton />
    </main>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm --filter web build`
Expected: 성공(보일러플 svg import 제거됨 — 미사용 경고 없음).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/_components/CatalogButton.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): 공개 홈(미니멀) + 재사용 카탈로그 버튼 (E3 P1)"
```

---

## Task 7: 카탈로그 목록 페이지 + EquipmentCard + loading/error

**Files:**
- Create: `apps/web/src/app/equipment/_components/EquipmentCard.tsx`
- Create: `apps/web/src/app/equipment/page.tsx`
- Create: `apps/web/src/app/equipment/loading.tsx`
- Create: `apps/web/src/app/equipment/error.tsx`

- [ ] **Step 1: EquipmentCard 구현**

`apps/web/src/app/equipment/_components/EquipmentCard.tsx`:
```tsx
import Image from "next/image";
import Link from "next/link";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";

// 카탈로그 카드 — 대표사진 + 이름·모델·카테고리. 모델/식별자는 mono.
export function EquipmentCard({ item }: { item: EquipmentPublic }) {
  const cover = item.photos[0];
  return (
    <Link
      href={`/equipment/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-bg transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-surface-2">
        {cover ? (
          <Image
            src={publicImageUrl(cover)}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-small text-muted">
            이미지 없음
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-h2 font-medium text-text">{item.name}</h2>
        {item.model && <span className="font-mono text-small text-muted">{item.model}</span>}
        {item.category && <span className="text-small text-muted">{item.category}</span>}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 카탈로그 페이지 구현**

`apps/web/src/app/equipment/page.tsx`:
```tsx
import type { Metadata } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { EquipmentCard } from "./_components/EquipmentCard";

export const metadata: Metadata = {
  title: "장비 카탈로그",
  description: "(주)재현테크 포장·자동화 장비 카탈로그.",
};

// 공개 카탈로그 — 동적 SSR(equipment_public, active만). 카테고리 필터는 후속.
export default async function EquipmentCatalogPage() {
  const items = await listPublicEquipment();
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="text-display font-semibold text-text">장비 카탈로그</h1>
        <p className="text-body text-muted">
          원하는 장비를 선택해 상세 정보를 확인하고 견적을 요청하세요.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-8 text-center text-body text-muted">
          등록된 장비가 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <EquipmentCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: loading/error 구현**

`apps/web/src/app/equipment/loading.tsx`:
```tsx
// 카탈로그 스켈레톤(서버 fetch 동안).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8 h-9 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </main>
  );
}
```

`apps/web/src/app/equipment/error.tsx`:
```tsx
"use client";

// 카탈로그 조회 실패 경계.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-20 text-center">
      <h1 className="text-h1 font-semibold text-text">목록을 불러오지 못했습니다</h1>
      <p className="text-body text-muted">잠시 후 다시 시도해 주세요.</p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-5 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm --filter web build`
Expected: 성공. `/equipment` 라우트가 빌드 출력에 나타남.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/equipment/
git commit -m "feat(web): 공개 장비 카탈로그 목록 페이지 (E3 P1)"
```

---

## Task 8: 상세 페이지 + 컴포넌트(Gallery·SpecTable·YoutubeEmbed) + generateMetadata

**Files:**
- Create: `apps/web/src/app/equipment/[id]/_components/SpecTable.tsx`
- Create: `apps/web/src/app/equipment/[id]/_components/YoutubeEmbed.tsx`
- Create: `apps/web/src/app/equipment/[id]/_components/PublicGallery.tsx`
- Create: `apps/web/src/app/equipment/[id]/page.tsx`

- [ ] **Step 1: SpecTable 구현**

`apps/web/src/app/equipment/[id]/_components/SpecTable.tsx`:
```tsx
import type { Spec } from "@jhtechsaas/shared";

// 사양 테이블 — 항목/값. 값은 mono(수치·식별자 정렬). 빈 배열이면 안내 문구.
export function SpecTable({ specs }: { specs: Spec[] }) {
  if (specs.length === 0) {
    return <p className="text-body text-muted">사양 정보 없음</p>;
  }
  return (
    <table className="w-full border-collapse text-body">
      <tbody>
        {specs.map((s, i) => (
          <tr key={i} className="border-b border-border">
            <th className="w-1/3 py-2 pr-4 text-left font-medium text-muted">{s.label}</th>
            <td className="py-2 font-mono text-text">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: YoutubeEmbed 구현**

`apps/web/src/app/equipment/[id]/_components/YoutubeEmbed.tsx`:
```tsx
import { parseYoutubeId, youtubeEmbedUrl } from "@/lib/equipment/youtube";

// youtube_url → 임베드. 파싱 실패·null이면 렌더 안 함.
export function YoutubeEmbed({ url }: { url: string | null }) {
  const id = parseYoutubeId(url);
  if (!id) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-surface-2">
      <iframe
        src={youtubeEmbedUrl(id)}
        title="제품 영상"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
```

- [ ] **Step 3: PublicGallery 구현 (client)**

`apps/web/src/app/equipment/[id]/_components/PublicGallery.tsx`:
```tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import { publicImageUrl } from "@/lib/equipment/images";

// 상세 갤러리 — 대표(첫장) 큰 이미지 + 썸네일 전환. 사진 0장이면 placeholder.
export function PublicGallery({ photos, name }: { photos: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-surface-2 text-body text-muted">
        이미지 없음
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-surface-2">
        <Image
          src={publicImageUrl(photos[active])}
          alt={`${name} 사진 ${active + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain"
          priority
        />
      </div>
      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`사진 ${i + 1} 보기`}
                aria-current={i === active}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-sm border ${
                  i === active ? "border-accent" : "border-border"
                }`}
              >
                <Image src={publicImageUrl(p)} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 상세 페이지 구현 (generateMetadata + notFound)**

`apps/web/src/app/equipment/[id]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { buildEquipmentMetadata } from "@/lib/seo/equipment-meta";
import { siteUrl } from "@/lib/seo/site";
import { getPublicEnv } from "@/env";
import { PublicGallery } from "./_components/PublicGallery";
import { SpecTable } from "./_components/SpecTable";
import { YoutubeEmbed } from "./_components/YoutubeEmbed";

// Next 16: params는 Promise.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const eq = await getPublicEquipment(id);
  if (!eq) return { title: "장비를 찾을 수 없습니다" };
  return buildEquipmentMetadata(eq, siteUrl(), getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eq = await getPublicEquipment(id);
  if (!eq) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link href="/equipment" className="mb-6 inline-block text-small text-muted hover:text-text">
        ← 카탈로그로
      </Link>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <PublicGallery photos={eq.photos} name={eq.name} />
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-display font-semibold text-text">{eq.name}</h1>
            {eq.model && <span className="font-mono text-body text-muted">{eq.model}</span>}
            {eq.category && <span className="text-small text-muted">{eq.category}</span>}
          </header>
          <section className="flex flex-col gap-3">
            <h2 className="text-h2 font-medium text-text">사양</h2>
            <SpecTable specs={eq.specs} />
          </section>
          {/* P2에서 /request?equipment=[id] 폼으로 배선(머지 시 P2 동시 존재). */}
          <Link
            href={`/request?equipment=${eq.id}`}
            className="inline-flex w-fit items-center justify-center rounded-md bg-accent px-6 py-3 text-body font-medium text-white"
          >
            이 장비로 견적 요청
          </Link>
        </div>
      </div>
      {eq.youtube_url && (
        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-h2 font-medium text-text">제품 영상</h2>
          <YoutubeEmbed url={eq.youtube_url} />
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: 빌드 검증**

Run: `pnpm --filter web build`
Expected: 성공. `/equipment/[id]` 동적 라우트 표시.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/app/equipment/\[id\]/
git commit -m "feat(web): 공개 장비 상세 페이지(갤러리·스펙·영상·SEO 메타) (E3 P1)"
```

---

## Task 9: sitemap.ts + robots.ts + 루트 layout 메타

**Files:**
- Create: `apps/web/src/app/sitemap.ts`
- Create: `apps/web/src/app/robots.ts`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: sitemap.ts 구현**

`apps/web/src/app/sitemap.ts`:
```ts
import type { MetadataRoute } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { buildSitemapEntries } from "@/lib/seo/sitemap-entries";
import { siteUrl } from "@/lib/seo/site";

// 동적 sitemap — active 장비 상세 포함.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listPublicEquipment();
  return buildSitemapEntries(
    items.map((e) => e.id),
    siteUrl(),
  );
}
```

- [ ] **Step 2: robots.ts 구현**

`apps/web/src/app/robots.ts`:
```ts
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";

// 공개 크롤 허용 + /admin 차단 + sitemap 포인터.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
```

- [ ] **Step 3: 루트 layout 메타 갱신**

`apps/web/src/app/layout.tsx` — `metadata` 객체와 import 갱신:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "재현테크 견적관리",
    template: "%s | (주)재현테크",
  },
  description: "(주)재현테크 견적 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm --filter web build`
Expected: 성공. 출력에 `/sitemap.xml`, `/robots.txt` 표시.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/sitemap.ts apps/web/src/app/robots.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): sitemap·robots + 루트 메타(title template·metadataBase) (E3 P1)"
```

---

## Task 10: E2E — 카탈로그→상세, inactive 비노출

로컬 Supabase에 service_role로 active/inactive 장비를 직접 시드하고, anon으로 렌더 동작을 검증한다. **`afterAll`에서 시드 데이터를 정리**(E1 전역 카운트 RLS 테스트 오염 방지 — E2 후속 권고 반영).

**Files:**
- Create: `apps/web/e2e/public-catalog.spec.ts`

- [ ] **Step 1: E2E 스펙 작성**

`apps/web/e2e/public-catalog.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// 로컬 Supabase 표준 데모 키(비밀 아님 — 공개 표준 값). equipment.spec.ts와 동일.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ACTIVE_NAME = "E2E 공개 활성장비";
const INACTIVE_NAME = "E2E 공개 비활성장비";

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
  for (const name of [ACTIVE_NAME, INACTIVE_NAME]) {
    await rest(`equipment?name=eq.${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
  }
}

test.beforeAll(async () => {
  await cleanup();
  const res = await rest("equipment", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        name: ACTIVE_NAME,
        base_price: 1000000,
        status: "active",
        model: "PK-E2E",
        category: "포장기",
        specs: [{ label: "전압", value: "220V" }],
      },
      { name: INACTIVE_NAME, base_price: 2000000, status: "inactive" },
    ]),
  });
  if (!res.ok) {
    throw new Error(`E2E 시드 실패: ${res.status} ${await res.text()}`);
  }
});

test.afterAll(async () => {
  await cleanup();
});

test("공개 카탈로그: active 노출 + inactive 비노출 + 상세 진입", async ({ page }) => {
  await page.goto("/equipment");

  // active 카드 노출(카드 제목 = h2)
  await expect(page.getByRole("heading", { name: ACTIVE_NAME })).toBeVisible({ timeout: 15_000 });
  // inactive는 equipment_public에서 제외 → 미노출
  await expect(page.getByText(INACTIVE_NAME)).toHaveCount(0);

  // 카드 클릭 → 상세
  await page.getByRole("link", { name: new RegExp(ACTIVE_NAME) }).first().click();
  await page.waitForURL(/\/equipment\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  // 상세에 이름(h1)·스펙 노출, 가격 미노출
  await expect(page.getByRole("heading", { name: ACTIVE_NAME })).toBeVisible();
  await expect(page.getByText("전압")).toBeVisible();
  await expect(page.getByText("220V")).toBeVisible();
  await expect(page.getByText("1000000")).toHaveCount(0);

  // 견적 요청 CTA 존재(P2에서 /request 배선)
  await expect(page.getByRole("link", { name: "이 장비로 견적 요청" })).toBeVisible();
});
```

- [ ] **Step 2: E2E 실행 (로컬 Supabase 가동 전제)**

먼저 로컬 Supabase가 떠 있는지 확인: `supabase status` (없으면 `supabase start`).
Run: `pnpm --filter web exec playwright test public-catalog.spec.ts`
Expected: 1 passed. (playwright.config가 dev 서버를 로컬 Supabase로 강제 — 기존 설정.)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/e2e/public-catalog.spec.ts
git commit -m "test(web): 공개 카탈로그·상세 E2E(active 노출·inactive 비노출) (E3 P1)"
```

---

## Task 11: UI-SPEC.md 갱신 + 전체 게이트

**Files:**
- Modify: `UI-SPEC.md` (루트)

- [ ] **Step 1: UI-SPEC.md에 공개 surface 화면계약 추가**

`UI-SPEC.md` 끝에 아래 섹션 추가:
```markdown
## E3 P1 — 공개 카탈로그·상세 (anon)

### 홈 `/`
- 미니멀: 회사명(text-display) + 한 줄 소개(text-muted) + "장비 카탈로그 보기" CTA(bg-accent).
- 정식 랜딩은 후속 이슈. CatalogButton은 재사용 컴포넌트.

### 카탈로그 `/equipment`
- 반응형 그리드: 1열(모바일) / 2열(sm) / 3열(lg). max-w-6xl.
- 카드: 대표사진(aspect 4:3, 없으면 "이미지 없음" placeholder) + 이름(h2) + 모델(mono·muted) + 카테고리(muted).
- 빈 상태: "등록된 장비가 없습니다." (border+surface 박스).
- 5-state: loading(스켈레톤 6칸) / error(다시 시도) / empty / 정상 / (no auth — 공개라 해당 없음).

### 상세 `/equipment/[id]`
- 2열(lg): 좌 갤러리(대표 큰 이미지 + 썸네일 전환, 사진 0장 placeholder) / 우 정보(이름 h1, 모델 mono, 카테고리, 사양 테이블, "이 장비로 견적 요청" CTA).
- 사양 테이블: 항목(muted)·값(mono). 빈 배열 시 "사양 정보 없음".
- 영상: youtube_url 있을 때만 nocookie 임베드(aspect-video). 없으면 섹션 생략.
- 없거나 inactive → notFound(404).
- 가격·옵션 절대 미노출(equipment_public 뷰 경유).
- SEO: per-equipment generateMetadata(title·description·OG 절대이미지·canonical) + sitemap·robots.
```

- [ ] **Step 2: 전체 게이트 (PR 머지 전 필수 — lint·typecheck·build·test)**

Run(순서대로):
```bash
pnpm --filter web exec vitest run          # 단위 — 기존 + 신규(site·youtube·meta·sitemap) GREEN
pnpm --filter web exec tsc --noEmit         # 타입체크 에러 0
pnpm --filter web lint                       # lint 통과
pnpm --filter web build                      # 빌드 성공
```
Expected: 전부 통과. (db-tests·E2E는 Task 10에서 이미 실행 — 로컬 Supabase 필요 시 별도.)

- [ ] **Step 3: 커밋**

```bash
git add UI-SPEC.md
git commit -m "docs: UI-SPEC에 E3 P1 공개 카탈로그·상세 화면계약 추가"
```

---

## Notes / 후속

- **`/request` CTA**: P1 상세의 "이 장비로 견적 요청"은 `/request?equipment=[id]`를 가리킨다. P2 전엔 404 — E3는 P1+P2를 **한 PR로 머지**(설계 §2)하므로 머지 시점엔 깨지지 않음. P1만 단독 머지 금지.
- **proxy no-store**: 공개 페이지가 CDN 캐시 안 됨(동적 SSR이라 기능 무방). 트래픽 증가 시 matcher 범위 축소로 최적화 검토(후속).
- **카테고리 필터·정식 랜딩**: 의도적 비포함(설계 §8).
- **다음 sub-plan(P2)**: `submit_application()` RPC + `/request` 폼 + 상세 CTA 배선. 별도 brainstorm/plan.
```
