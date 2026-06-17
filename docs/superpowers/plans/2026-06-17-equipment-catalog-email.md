# 장비 카탈로그 + 메일 카탈로그 링크 Implementation Plan — Part B+C

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** 장비에 카탈로그 PDF를 등록하고, 견적 메일에 견적서·카탈로그 다운로드 링크를 함께 보낸다.

**Architecture:** 공개 버킷 `equipment-catalogs`에 `equipment/{id}/catalog.pdf` 저장, `equipment.catalog_pdf` 경로 보관. 워커가 견적의 장비를 해석해 카탈로그 공개URL을 만들어 메일 템플릿의 두 번째 버튼으로 넣는다.

**Tech Stack:** Supabase Storage(공개 버킷), Next.js, Vitest, pg(db-tests), 워커(tsx).

## Global Constraints
- 카탈로그 = 공개 버킷, 영구 링크(서명URL 아님). PDF만, 20MiB.
- 경로 정규식 `^equipment/[0-9a-f-]{36}/catalog\.pdf$` — DB CHECK + 버킷 정책 + Zod 3중.
- 마이그 한 의도 + 롤백. `as any` 금지. db-test/e2e는 클린 reset+seed.
- 견적서 링크는 항상, 카탈로그 링크는 catalog_pdf 있을 때만.

---

### Task 1: DB — equipment-catalogs 버킷 + equipment.catalog_pdf

**Files:**
- Create: `supabase/migrations/20260617140000_equipment_catalog.sql`
- Create: `supabase/rollback/20260617140000_equipment_catalog_down.sql`
- Modify: `packages/db-tests/src/` — 신규 `equipment_catalog.test.ts`

- [ ] **Step 1: db-test 작성(RED)** — `packages/db-tests/src/equipment_catalog.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const UUID = "11111111-1111-1111-1111-111111111111";

describe("equipment.catalog_pdf CHECK", () => {
  test("올바른 경로 허용", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const r = await c.query(
        `insert into public.equipment (id, name, catalog_pdf) values ($1,'장비',$2) returning id`,
        [UUID, `equipment/${UUID}/catalog.pdf`],
      );
      expect(r.rowCount).toBe(1);
    });
  });
  test("잘못된 경로 거부", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      await expect(
        c.query(`insert into public.equipment (id, name, catalog_pdf) values ($1,'장비','equipment/x/bad.pdf')`, [UUID]),
      ).rejects.toThrow();
    });
  });
  test("null 허용", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const r = await c.query(`insert into public.equipment (id, name) values ($1,'장비') returning id`, [UUID]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("equipment-catalogs 버킷", () => {
  test("공개 버킷 + pdf mime 등록됨", async () => {
    await asPostgres(c);
    const r = await c.query(`select public, allowed_mime_types from storage.buckets where id='equipment-catalogs'`);
    expect(r.rows[0]?.public).toBe(true);
    expect(r.rows[0]?.allowed_mime_types).toContain("application/pdf");
  });
});
```

- [ ] **Step 2: db-test 실행 → 실패 확인(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests exec vitest run src/equipment_catalog.test.ts`
Expected: FAIL — 컬럼·버킷 없음.

- [ ] **Step 3: 마이그레이션 작성(GREEN)** — `supabase/migrations/20260617140000_equipment_catalog.sql`

```sql
-- 장비 카탈로그 PDF — 공개 버킷 + equipment.catalog_pdf 경로.
-- 견적 메일에 카탈로그 다운로드 링크로 사용(영구 공개 URL).

-- 1. 공개 버킷(PDF 전용, 20MiB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-catalogs', 'equipment-catalogs', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- 2. 정책 — 읽기 공개, 쓰기 equipment.manage + 경로 정규식.
create policy equipment_catalogs_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'equipment-catalogs');
create policy equipment_catalogs_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
    and name ~ '^equipment/[0-9a-f-]{36}/catalog\.pdf$'
  );
create policy equipment_catalogs_update on storage.objects
  for update to authenticated using (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );
create policy equipment_catalogs_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'equipment-catalogs'
    and (select public.has_permission((select auth.uid()), 'equipment.manage'))
  );

-- 3. equipment.catalog_pdf 컬럼 + 경로 CHECK.
alter table public.equipment add column if not exists catalog_pdf text;
alter table public.equipment
  add constraint equipment_catalog_pdf_path
    check (catalog_pdf is null or catalog_pdf ~ '^equipment/[0-9a-f-]{36}/catalog\.pdf$');
```

- [ ] **Step 4: 롤백 작성** — `supabase/rollback/20260617140000_equipment_catalog_down.sql`

```sql
alter table public.equipment drop constraint if exists equipment_catalog_pdf_path;
alter table public.equipment drop column if exists catalog_pdf;
drop policy if exists equipment_catalogs_read on storage.objects;
drop policy if exists equipment_catalogs_insert on storage.objects;
drop policy if exists equipment_catalogs_update on storage.objects;
drop policy if exists equipment_catalogs_delete on storage.objects;
delete from storage.buckets where id = 'equipment-catalogs';
```

- [ ] **Step 5: 리셋 + db-test → 통과(GREEN)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests exec vitest run src/equipment_catalog.test.ts`
Expected: 전체 PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260617140000_equipment_catalog.sql supabase/rollback/20260617140000_equipment_catalog_down.sql packages/db-tests/src/equipment_catalog.test.ts
git commit -m "feat: equipment-catalogs 버킷 + equipment.catalog_pdf"
```

---

### Task 2: Zod 스키마 — catalog_pdf 경로 검증

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts`
- Test: `apps/web/src/lib/equipment/schema.test.ts` (있으면 추가, 없으면 신규)

- [ ] **Step 1: 테스트(RED)** — schema.test.ts에 추가(없으면 신규 생성, import는 기존 schema export 사용)

```ts
import { describe, expect, it } from "vitest";
import { equipmentFormSchema } from "./schema";

describe("catalog_pdf", () => {
  const base = { name: "장비", base_price: 0, status: "active", category_id: null };
  it("올바른 경로 통과", () => {
    const r = equipmentFormSchema.safeParse({ ...base, catalog_pdf: "equipment/11111111-1111-1111-1111-111111111111/catalog.pdf" });
    expect(r.success).toBe(true);
  });
  it("빈 문자열 허용(기본)", () => {
    const r = equipmentFormSchema.safeParse({ ...base, catalog_pdf: "" });
    expect(r.success).toBe(true);
  });
  it("잘못된 경로 거부", () => {
    const r = equipmentFormSchema.safeParse({ ...base, catalog_pdf: "equipment/x/bad.pdf" });
    expect(r.success).toBe(false);
  });
});
```
(⚠️ 실행 전 schema.ts의 다른 필수 필드 기본값 확인 — base에 누락 필드 있으면 보강. specs/photos/options 등은 `.default`가 있으면 생략 가능.)

- [ ] **Step 2: 실행 → 실패(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm exec vitest run src/lib/equipment/schema.test.ts`
Expected: catalog_pdf 케이스 FAIL(필드 미정의 → strip되어 거부 케이스가 통과 못 함).

- [ ] **Step 3: 스키마에 catalog_pdf 추가(GREEN)** — `schema.ts`의 object에 추가(quote_device_image 옆)

```ts
  catalog_pdf: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(/^equipment\/[0-9a-f-]{36}\/catalog\.pdf$/i, "잘못된 카탈로그 경로"),
    ])
    .default(""),
```

- [ ] **Step 4: 통과(GREEN)**

Run: `pnpm exec vitest run src/lib/equipment/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/lib/equipment/schema.test.ts
git commit -m "feat: equipment 스키마에 catalog_pdf 경로 검증"
```

---

### Task 3: CatalogUploader + 폼 + 저장

**Files:**
- Create: `apps/web/src/app/admin/equipment/_components/CatalogUploader.tsx`
- Modify: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`
- Modify: `apps/web/src/app/admin/equipment/actions.ts` (create/update에 catalog_pdf)

**Interfaces:**
- Consumes: 버킷 `equipment-catalogs`, 경로 `equipment/{id}/catalog.pdf`.

- [ ] **Step 1: CatalogUploader 작성** — BannerUploader 패턴 차용, PDF 전용.

```tsx
"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX = 20 * 1024 * 1024;
export function CatalogUploader({
  equipmentId, value, onChange,
}: { equipmentId: string; value: string; onChange: (path: string) => void }) {
  const supabase = createSupabaseBrowserClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    if (file.type !== "application/pdf") { setError("PDF 파일만 업로드할 수 있습니다"); return; }
    if (file.size > MAX) { setError("20MB 이하만 업로드할 수 있습니다"); return; }
    setBusy(true);
    const path = `equipment/${equipmentId}/catalog.pdf`;
    const { error: upErr } = await supabase.storage
      .from("equipment-catalogs")
      .upload(path, file, { contentType: "application/pdf", upsert: true });
    setBusy(false);
    if (upErr) { setError(`업로드 실패: ${upErr.message}`); return; }
    onChange(path);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-small font-medium text-text">제품 카탈로그 (PDF)</span>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-small">
          <span className="truncate text-text">카탈로그 등록됨 (catalog.pdf)</span>
          <button type="button" onClick={() => onChange("")} className="text-danger underline">제거</button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="rounded-md border border-dashed border-border px-3 py-3 text-small text-muted hover:bg-surface-2 disabled:opacity-50">
          {busy ? "업로드 중…" : "PDF 카탈로그 업로드 (최대 20MB)"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
```
(⚠️ `createSupabaseBrowserClient` import 경로는 BannerUploader가 쓰는 것과 동일하게 맞출 것.)

- [ ] **Step 2: EquipmentForm에 통합** — BannerUploader 2개 렌더 근처에 CatalogUploader 추가. 폼 state `catalog_pdf` 연결(`values.catalog_pdf`/`setValue`). EquipmentFormValues에 catalog_pdf 포함(스키마 infer면 자동).

- [ ] **Step 3: actions.ts create/update** — insert/update 객체에 `catalog_pdf: v.catalog_pdf || null` 추가(quote_device_* 옆).

- [ ] **Step 4: typecheck + lint + build**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck && pnpm run lint && pnpm run build`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/equipment/_components/CatalogUploader.tsx apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx apps/web/src/app/admin/equipment/actions.ts
git commit -m "feat: 장비 폼에 카탈로그 PDF 업로드"
```

---

### Task 4: 메일 템플릿 — 카탈로그 두 번째 버튼

**Files:**
- Modify: `packages/shared/src/mail.ts`
- Modify: `packages/shared/src/mail.test.ts`

- [ ] **Step 1: 테스트(RED)** — mail.test.ts에 추가

```ts
  test("composeQuoteEmailHtml: 카탈로그 URL 있으면 두 번째 버튼", () => {
    const html = composeQuoteEmailHtml({ body: "본문", downloadUrl: "https://x/q.pdf", quoteNo: "Q1", catalogDownloadUrl: "https://x/c.pdf" });
    expect(html).toContain("제품 카탈로그(PDF) 다운로드");
    expect(html).toContain('href="https://x/c.pdf"');
  });
  test("composeQuoteEmailHtml: 카탈로그 URL 없으면 카탈로그 버튼 없음", () => {
    const html = composeQuoteEmailHtml({ body: "본문", downloadUrl: "https://x/q.pdf", quoteNo: "Q1" });
    expect(html).not.toContain("제품 카탈로그");
  });
```

- [ ] **Step 2: 실행 → 실패(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && pnpm --filter @jhtechsaas/shared exec vitest run src/mail.test.ts`
Expected: 카탈로그 케이스 FAIL.

- [ ] **Step 3: composeQuoteEmailHtml 확장(GREEN)** — 시그니처에 `catalogDownloadUrl?: string` 추가. 견적서 버튼 table 다음에, catalogDownloadUrl 있으면 두 번째 버튼(아웃라인 스타일) table을 추가:

```ts
export function composeQuoteEmailHtml(p: { body: string; downloadUrl: string; quoteNo: string; catalogDownloadUrl?: string }): string {
```
견적서 버튼 `</table>` 직후, 폴백 안내 `<div>` 앞에 삽입:
```ts
    ...(p.catalogDownloadUrl
      ? [
          `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px"><tr>`,
          `<td align="center" style="border-radius:8px;border:1.5px solid ${PINE}">`,
          `<a href="${escapeHtml(p.catalogDownloadUrl)}" style="display:inline-block;padding:13px 30px;color:${PINE};font-size:15px;font-weight:700;text-decoration:none">📘&nbsp;&nbsp;제품 카탈로그(PDF) 다운로드</a>`,
          `</td></tr></table>`,
        ]
      : []),
```
(배열 join 방식이라 spread로 끼워넣는다.)

- [ ] **Step 4: 통과(GREEN)**

Run: `pnpm --filter @jhtechsaas/shared exec vitest run src/mail.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/mail.ts packages/shared/src/mail.test.ts
git commit -m "feat: 견적 메일에 카탈로그 다운로드 버튼(선택)"
```

---

### Task 5: 워커 — 견적 장비 카탈로그 해석 + 공개URL

**Files:**
- Create: `apps/worker/src/jobs/quote-equipment.ts` (pickQuoteEquipmentId 순수 함수)
- Create: `apps/worker/src/jobs/quote-equipment.test.ts`
- Modify: `apps/worker/src/jobs/email.ts`

**Interfaces:**
- Produces: `pickQuoteEquipmentId(items: unknown, applicationEquipmentId: string | null): string | null`.

- [ ] **Step 1: 순수 함수 테스트(RED)** — `quote-equipment.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { pickQuoteEquipmentId } from "./quote-equipment";

describe("pickQuoteEquipmentId", () => {
  it("견적 items[0].equipmentId 우선", () => {
    expect(pickQuoteEquipmentId([{ equipmentId: "A" }], "B")).toBe("A");
  });
  it("items에 없으면 의뢰 장비로 폴백", () => {
    expect(pickQuoteEquipmentId([{ name: "x" }], "B")).toBe("B");
  });
  it("둘 다 없으면 null", () => {
    expect(pickQuoteEquipmentId([], null)).toBeNull();
    expect(pickQuoteEquipmentId(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: 실행 → 실패(RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/worker && pnpm exec vitest run src/jobs/quote-equipment.test.ts`
Expected: FAIL(모듈 없음).

- [ ] **Step 3: 순수 함수 구현(GREEN)** — `quote-equipment.ts`

```ts
// 견적의 주 장비 id 해석 — 견적 items[0].equipmentId 우선, 없으면 의뢰 신청장비.
// (quote-pdf.ts의 우선순위와 동일. 카탈로그·사양 조회에 공용.)
export function pickQuoteEquipmentId(
  items: unknown,
  applicationEquipmentId: string | null,
): string | null {
  const first = Array.isArray(items) ? (items[0] as { equipmentId?: unknown } | undefined) : undefined;
  const fromItem = typeof first?.equipmentId === "string" && first.equipmentId ? first.equipmentId : null;
  return fromItem ?? applicationEquipmentId ?? null;
}
```

- [ ] **Step 4: 통과(GREEN)**

Run: `pnpm exec vitest run src/jobs/quote-equipment.test.ts`
Expected: PASS.

- [ ] **Step 5: email.ts에서 카탈로그 공개URL 조회·전달**

`email.ts`의 quote select에 `items`도 가져오고, application의 equipment_id 조회 후 `pickQuoteEquipmentId`로 장비 id 결정 → `equipment` 테이블서 `catalog_pdf` 조회 → 있으면 `supabase.storage.from('equipment-catalogs').getPublicUrl(path).data.publicUrl` → `composeQuoteEmailHtml({..., catalogDownloadUrl})`로 전달. 카탈로그 없으면 미전달(견적서 링크만).
(⚠️ quotes에 application_id 있음 → application.equipment_id 조회. 조회 실패·미존재는 카탈로그 생략, 메일은 정상 발송.)

- [ ] **Step 6: 워커 단위 + 통합 일부**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/worker && pnpm run typecheck && pnpm run test:ci`
Expected: 통과.

- [ ] **Step 7: 커밋**

```bash
git add apps/worker/src/jobs/quote-equipment.ts apps/worker/src/jobs/quote-equipment.test.ts apps/worker/src/jobs/email.ts
git commit -m "feat: 견적 메일에 장비 카탈로그 공개URL 링크 추가"
```

---

### Task 6: 게이트 + 배포

- [ ] **Step 1: 전체 게이트**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/shared test && pnpm --filter @jhtechsaas/db-tests test:rls && pnpm --filter web test && pnpm --filter web run build && pnpm --filter worker run test:ci`
Expected: GREEN(demo_reservations 동시성 플레이키는 알려진 예외).

- [ ] **Step 2: 시각 — 카탈로그 버튼 포함 메일 렌더 → Read 대조.**

- [ ] **Step 3: PR → 머지 → `supabase db push`(원격, 버킷+컬럼) → 프로덕션 200 확인.**

## Self-Review
- B1=Task1, B2=Task2/3, C1=Task5, C2=Task4. 커버 완료.
- 타입 일관: `catalog_pdf`(컬럼·zod·actions), `catalogDownloadUrl`(mail), `pickQuoteEquipmentId`(worker) 일치.
- 플레이스홀더: SQL·TS 구체. ⚠️표시는 실행 시 기존 파일 확인 포인트(스키마 기본값·import 경로).
