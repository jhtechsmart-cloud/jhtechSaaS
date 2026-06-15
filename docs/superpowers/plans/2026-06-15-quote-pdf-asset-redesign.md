# 견적서 PDF 자산 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적서 PDF를 새 자산 4종(A4 배경·회사로고=고정, 장비이미지·장비네임=장비별)으로 다시 짜고, 본문 세부는 렌더 결과를 Read 도구로 대조하며 조정한다.

**Architecture:** 고정 자산(배경·로고)은 워커 번들(`apps/worker/assets/`)에 base64 인라인. 장비별 자산은 기존 `equipment.quote_banner_top/bottom` 컬럼을 `quote_device_name/quote_device_image`로 rename(경로 정규식 `device-(name|image)`)하여 스토리지에서 다운로드. `quote-html.ts`를 배경 레이어 + 좌상단 로고 + 하단 좌우 장비 구성으로 재작성.

**Tech Stack:** Postgres(Supabase migration/RLS) · pg db-tests · Next.js(React Hook Form + Zod) · puppeteer-core(워커 HTML→PDF) · Vitest.

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `supabase/migrations/20260615120000_quote_device_assets.sql` | banner→device 컬럼 rename + 경로 CHECK | Create |
| `supabase/rollback/20260615120000_quote_device_assets_down.sql` | 롤백 | Create |
| `packages/db-tests/src/quote-pdf-fields.test.ts` | 새 컬럼 경로 CHECK 단언 | Modify |
| `apps/worker/assets/quote-bg.jpg`, `company-logo.png` | 고정 자산 | Create(복사) |
| `apps/worker/src/jobs/assets.ts` | 고정 자산 로더 2종 추가 | Modify |
| `apps/worker/src/jobs/quote-html.ts` | 양식 재작성 + 타입 변경 | Modify |
| `apps/worker/src/jobs/quote-html.test.ts` | 자산/필드 렌더 단언 | Modify |
| `apps/worker/src/jobs/quote-pdf.ts` | select 필드명 + 자산 배선 | Modify |
| `apps/worker/src/jobs/_render-sample.ts` | 시각 검증 하니스(tsx) | Create |
| `apps/web/src/lib/equipment/schema.ts` | Zod 필드/정규식 교체 | Modify |
| `apps/web/src/app/admin/equipment/actions.ts` | 필드명 교체 | Modify |
| `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` | defaultValues/useController/슬롯 | Modify |
| `apps/web/src/app/admin/equipment/_components/BannerUploader.tsx` | slot 의미(name/image) + 라벨 + 경로 | Modify |

---

## Task 1: DB 마이그레이션 — banner→device 컬럼 rename

**Files:**
- Create: `supabase/migrations/20260615120000_quote_device_assets.sql`
- Create: `supabase/rollback/20260615120000_quote_device_assets_down.sql`
- Modify: `packages/db-tests/src/quote-pdf-fields.test.ts`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260615120000_quote_device_assets.sql`:
```sql
-- 견적서 PDF 양식 재구성: 장비별 자산 = 우하단 장비이미지 + 좌하단 장비네임.
-- 기존 상/하단 "폭 전체 배너" 개념 폐기 → 컬럼을 새 의미로 rename + 경로 정규식 교체.
-- 기존 배너 값은 새 경로(device-*) 형식과 안 맞아 CHECK 위반 → null 초기화(운영 배너 폐기 합의).

-- 1) 기존 CHECK 제약 드롭(rename 전).
alter table public.equipment
  drop constraint if exists equipment_quote_banner_top_path,
  drop constraint if exists equipment_quote_banner_bottom_path;

-- 2) 컬럼 rename: banner_bottom→device_image(우하단), banner_top→device_name(좌하단).
alter table public.equipment rename column quote_banner_bottom to quote_device_image;
alter table public.equipment rename column quote_banner_top to quote_device_name;

-- 3) 기존 배너 경로 값 폐기(새 CHECK 위반 방지).
update public.equipment set quote_device_image = null, quote_device_name = null;

-- 4) 새 경로 형식 CHECK: equipment/{uuid}/device-(image|name).{ext}
alter table public.equipment
  add constraint equipment_quote_device_image_path
    check (quote_device_image is null or quote_device_image ~ '^equipment/[0-9a-f-]{36}/device-image\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_device_name_path
    check (quote_device_name is null or quote_device_name ~ '^equipment/[0-9a-f-]{36}/device-name\.(jpg|jpeg|png|webp)$');
```

- [ ] **Step 2: 롤백 작성**

`supabase/rollback/20260615120000_quote_device_assets_down.sql`:
```sql
-- 롤백: device 컬럼 → banner 컬럼 복원(값은 복구 불가 — 폐기됨).
alter table public.equipment
  drop constraint if exists equipment_quote_device_image_path,
  drop constraint if exists equipment_quote_device_name_path;
alter table public.equipment rename column quote_device_image to quote_banner_bottom;
alter table public.equipment rename column quote_device_name to quote_banner_top;
alter table public.equipment
  add constraint equipment_quote_banner_top_path
    check (quote_banner_top is null or quote_banner_top ~ '^equipment/[0-9a-f-]{36}/banner-top\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_banner_bottom_path
    check (quote_banner_bottom is null or quote_banner_bottom ~ '^equipment/[0-9a-f-]{36}/banner-bottom\.(jpg|jpeg|png|webp)$');
```

- [ ] **Step 3: db-test 수정 (먼저 실패)**

`packages/db-tests/src/quote-pdf-fields.test.ts`의 `describe("equipment 견적서 배너 컬럼"...)` 블록을 통째로 아래로 교체(테스트명·컬럼명·제약명을 device로):
```ts
describe("equipment 견적서 장비 자산 컬럼", () => {
  test("equipment.manage → 유효 경로로 quote_device_name UPDATE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      // 버킷-상대 경로 = equipment/{장비id}/device-name.png (CHECK 정규식 통과).
      const path = `equipment/${EQ}/device-name.png`;
      await c.query("update public.equipment set quote_device_name=$1 where id=$2", [path, EQ]);
      await asPostgres(c);
      const row = (await c.query("select quote_device_name from public.equipment where id=$1", [EQ])).rows[0];
      expect(row.quote_device_name).toBe(path);
    });
  });

  test("잘못된 경로(../evil.png)는 CHECK 위반으로 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.equipment set quote_device_name=$1 where id=$2", ["../evil.png", EQ]),
      ).rejects.toThrow(/equipment_quote_device_name_path/);
    });
  });

  test("device_image도 유효/무효 경로를 동일하게 가드", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      // 유효 경로 성공.
      const path = `equipment/${EQ}/device-image.webp`;
      await c.query("update public.equipment set quote_device_image=$1 where id=$2", [path, EQ]);
      // 무효 경로(name 파일명을 image 컬럼에) 거부.
      await expect(
        c.query("update public.equipment set quote_device_image=$1 where id=$2", [`equipment/${EQ}/device-name.png`, EQ]),
      ).rejects.toThrow(/equipment_quote_device_image_path/);
    });
  });
});
```
파일 상단 주석(12~14행)의 `quote_banner_top/bottom` 언급도 `quote_device_name/image`로 갱신.

- [ ] **Step 4: 마이그레이션 적용 + db-test 실행**

Run:
```bash
supabase db reset
bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/db-tests test:rls -- quote-pdf-fields
```
Expected: PASS (3 device 테스트 통과). reset이 마이그레이션을 적용해 컬럼명이 device로 바뀐 상태.

- [ ] **Step 5: 롤백 검증(수동)**

Run:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/rollback/20260615120000_quote_device_assets_down.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d public.equipment" | grep -E "quote_banner|quote_device"
```
Expected: `quote_banner_top`·`quote_banner_bottom` 복원 확인. 검증 후 `supabase db reset`으로 다시 정방향 적용.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260615120000_quote_device_assets.sql supabase/rollback/20260615120000_quote_device_assets_down.sql packages/db-tests/src/quote-pdf-fields.test.ts
git commit -m "feat: 장비 견적 자산 컬럼 banner→device rename(우하단 이미지·좌하단 네임)"
```

---

## Task 2: 워커 고정 자산 추가 (배경·로고)

**Files:**
- Create: `apps/worker/assets/quote-bg.jpg`, `apps/worker/assets/company-logo.png`
- Modify: `apps/worker/src/jobs/assets.ts`

- [ ] **Step 1: 자산 파일 복사**

```bash
cp ~/Downloads/SG1625/1_견적서배경.jpg apps/worker/assets/quote-bg.jpg
cp ~/Downloads/SG1625/2_재현테크logo-컷팅기.png apps/worker/assets/company-logo.png
ls -la apps/worker/assets/
```
Expected: `quote-bg.jpg`·`company-logo.png` 존재(폰트·stamp와 함께).

- [ ] **Step 2: assets.ts에 로더 추가**

`apps/worker/src/jobs/assets.ts` — `let stampUri` 아래에 캐시 변수 추가, `getStampDataUri` 아래에 함수 2개 추가:
```ts
let bgUri: string | null = null;
let logoUri: string | null = null;
```
```ts
export async function getQuoteBgDataUri(): Promise<string> {
  if (!bgUri) bgUri = await toDataUri("quote-bg.jpg", "image/jpeg");
  return bgUri;
}
export async function getCompanyLogoDataUri(): Promise<string> {
  if (!logoUri) logoUri = await toDataUri("company-logo.png", "image/png");
  return logoUri;
}
```

- [ ] **Step 3: 타입 확인**

Run: `pnpm --filter @jhtechsaas/worker typecheck` (또는 워커 tsc) — Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/worker/assets/quote-bg.jpg apps/worker/assets/company-logo.png apps/worker/src/jobs/assets.ts
git commit -m "feat: 워커 견적서 고정 자산(배경·회사로고) 번들 + 로더"
```

---

## Task 3: quote-html.ts 양식 재작성 + 테스트

**Files:**
- Modify: `apps/worker/src/jobs/quote-html.ts`
- Modify: `apps/worker/src/jobs/quote-html.test.ts`

- [ ] **Step 1: 테스트 먼저 수정(실패)**

`apps/worker/src/jobs/quote-html.test.ts`의 `base` 객체에서 `bannerTopDataUri`·`bannerBottomDataUri` 두 줄을 제거하고 아래 4줄 추가:
```ts
  quoteBgDataUri: "data:image/jpeg;base64,BG",
  companyLogoDataUri: "data:image/png;base64,LOGO",
  deviceImageDataUri: "data:image/png;base64,DEV",
  deviceNameDataUri: "data:image/png;base64,NAME",
```
그리고 첫 테스트(`핵심 데이터가...`)에 자산 렌더 단언 추가:
```ts
    expect(html).toContain("data:image/jpeg;base64,BG");   // 배경
    expect(html).toContain("data:image/png;base64,LOGO");  // 회사 로고
    expect(html).toContain("data:image/png;base64,DEV");   // 우하단 장비 이미지
    expect(html).toContain("data:image/png;base64,NAME");  // 좌하단 장비 네임
```
새 테스트 추가(장비 자산 null이면 해당 영역 생략):
```ts
  test("장비 이미지/네임 없으면 해당 요소 미출력(배경·로고는 항상)", () => {
    const html = renderQuoteHtml({ ...base, deviceImageDataUri: null, deviceNameDataUri: null });
    expect(html).toContain("data:image/jpeg;base64,BG");
    expect(html).not.toContain("data:image/png;base64,DEV");
    expect(html).not.toContain("data:image/png;base64,NAME");
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --filter @jhtechsaas/worker test -- quote-html`
Expected: FAIL (타입 불일치 + 자산 미포함).

- [ ] **Step 3: quote-html.ts 재작성**

`apps/worker/src/jobs/quote-html.ts` 전체를 아래로 교체. 타입에서 배너 2종 제거, 자산 4종 추가. 레이아웃은 배경(body background) + 로고 좌상단 + 하단 좌우 장비. **본문(공급자표·합계·품목표·사양·특기)은 기존 마크업 유지**. 아래는 초안이며 Task 6 렌더 루프에서 수치(여백·로고폭·하단 장비 크기·배경 위 가독성)를 조정한다.
```ts
import { SUPPLIER } from "@jhtechsaas/shared";

export type QuoteHtmlItem = { name: string; qtyLabel: string; unitPrice: number; amount: number };
export type QuoteHtmlIncluded = { name: string; qtyLabel: string };
export type QuoteHtmlSpecGroup = { group: string; items: { label: string; value: string }[] };

export type QuoteHtmlData = {
  quoteNo: string;
  issuedDateLabel: string;
  assigneeName: string;
  assigneePhone: string | null;
  recipient: string;
  supplyPrice: number;
  koreanAmount: string;
  items: QuoteHtmlItem[];
  includedOptions: QuoteHtmlIncluded[];
  extraOptions: QuoteHtmlItem[];
  specGroups: QuoteHtmlSpecGroup[];
  notes: string[];
  quoteBgDataUri: string;            // 고정 A4 배경
  companyLogoDataUri: string;        // 고정 회사 로고(좌상단)
  deviceImageDataUri: string | null; // 장비별 우하단 이미지
  deviceNameDataUri: string | null;  // 장비별 좌하단 네임
  stampDataUri: string;
  fontDataUri: string;
};

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderQuoteHtml(d: QuoteHtmlData): string {
  const itemRows = d.items
    .map(
      (it) => `<tr class="main"><td class="name"><b>${esc(it.name)}</b></td><td>${esc(it.qtyLabel)}</td><td class="num">${won(it.unitPrice)}</td><td class="num">${won(it.amount)}</td><td></td></tr>`,
    )
    .join("");
  const incRows = d.includedOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num">포함</td><td class="num">포함</td><td></td></tr>`)
    .join("");
  const extraRows = d.extraOptions
    .map((o) => `<tr class="sub"><td class="name"> - ${esc(o.name)}</td><td>${esc(o.qtyLabel)}</td><td class="num">${won(o.unitPrice)}</td><td class="num">${won(o.amount)}</td><td></td></tr>`)
    .join("");
  const specs = d.specGroups.length
    ? `<div class="band">장비사양 (Specification)</div><div class="specs">${d.specGroups
        .map((g) => `<div class="spec-group"><div class="spec-title">${esc(g.group)}</div>${g.items.map((i) => `<div class="spec-item">· ${esc(i.label)} : ${esc(i.value)}</div>`).join("")}</div>`)
        .join("")}</div>`
    : "";
  const notes = d.notes.map((n, i) => `<div class="note">${i + 1}. ${esc(n)}</div>`).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@font-face{font-family:'KR';src:url("${d.fontDataUri}");}
@page{size:A4;margin:0;}
*{box-sizing:border-box;margin:0;padding:0;font-family:'KR',sans-serif;}
/* 배경 이미지를 페이지 전체에 깔고, 본문은 그 위 레이어. A4 높이 채워 하단 장비 영역을 바닥 고정. */
body{position:relative;width:210mm;min-height:296mm;color:#111;font-size:13px;
  background-image:url("${d.quoteBgDataUri}");background-size:cover;background-position:center;
  display:flex;flex-direction:column;}
.logo{width:46mm;margin:10mm 0 2mm 14mm;display:block;}
.pad{padding:0 14mm;flex:1 1 auto;}
.head{display:flex;justify-content:space-between;gap:16px;margin-top:2mm;align-items:stretch;}
.head-left{display:flex;flex-direction:column;flex:1;min-width:0;}
.meta div{line-height:1.7;}
.meta .ml{display:inline-block;width:74px;}
.recipient-row{margin-top:auto;padding-top:10px;padding-bottom:3px;text-align:right;border-bottom:2.5px solid #111;}
.recipient{font-size:24px;font-weight:700;}
.rsuffix{font-size:16px;font-weight:500;margin-left:6px;}
.supplier{position:relative;width:54%;font-size:12px;}
.supplier table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.85);}
.supplier td{border:1px solid #888;padding:3px 7px;word-break:keep-all;}
.supplier td.k{white-space:nowrap;background:#f4f4f4;font-weight:500;text-align:center;}
.supplier td.title{text-align:center;letter-spacing:6px;background:#ececec;font-weight:600;}
.stamp{position:absolute;right:6px;top:26px;width:66px;opacity:.95;z-index:2;}
.lead{margin:8px 0;}
.sumband{display:flex;align-items:stretch;margin:8px 0;}
.sumband .lbl{width:200px;display:flex;align-items:center;justify-content:center;background:#3a4a5a;color:#fff;font-weight:700;letter-spacing:4px;padding:8px 16px;}
.sumband .amt-bg{flex:1;display:flex;align-items:center;background:#ececec;padding:0 16px;}
.sumband .amt{margin-left:auto;font-size:18px;font-weight:700;}
.sumband .unit{margin-left:18px;font-size:12px;font-weight:700;color:#555;}
table.items{width:100%;border-collapse:collapse;margin-top:4px;background:rgba(255,255,255,.85);}
table.items th,table.items td{border:1px solid #333;padding:4px 6px;text-align:center;}
table.items th{background:#f3f3f3;}
table.items td.name{text-align:left;}
table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
table.items tr.total td{font-weight:700;}
.band{background:#3a4a5a;color:#fff;text-align:center;letter-spacing:6px;padding:5px;margin-top:12px;}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;padding:8px 2px;}
.spec-title{font-weight:700;margin-top:4px;}
.note{margin:2px 0;color:#333;}
/* 하단 좌우 장비 영역 — 배경 조명 위. 좌=네임, 우=이미지. */
.device{display:flex;justify-content:space-between;align-items:flex-end;padding:0 14mm 12mm;gap:10mm;}
.device .name-img{width:64mm;max-height:34mm;object-fit:contain;}
.device .dev-img{width:88mm;max-height:50mm;object-fit:contain;}
</style></head><body>
<img class="logo" src="${d.companyLogoDataUri}">
<div class="pad">
  <div class="head">
    <div class="head-left">
      <div class="meta">
        <div><span class="ml">견 적 일 자 :</span>${esc(d.issuedDateLabel)}</div>
        <div><span class="ml">견 적 번 호 :</span>${esc(d.quoteNo)}</div>
        <div><span class="ml">담 당 자 명 :</span>${esc(d.assigneeName)}</div>
        ${d.assigneePhone ? `<div><span class="ml"></span>${esc(d.assigneePhone)}</div>` : ""}
      </div>
      <div class="recipient-row"><span class="recipient">${esc(d.recipient)}</span><span class="rsuffix">귀하</span></div>
    </div>
    <div class="supplier">
      <img class="stamp" src="${d.stampDataUri}">
      <table>
        <tr><td class="title" colspan="4">공 급 자</td></tr>
        <tr><td class="k">등록번호</td><td colspan="3">${SUPPLIER.bizNo}</td></tr>
        <tr><td class="k">상 호</td><td>${SUPPLIER.name}</td><td class="k">성 명</td><td>${SUPPLIER.ceo}</td></tr>
        <tr><td class="k">주 소</td><td colspan="3">${SUPPLIER.address}<br>서울본사 ${SUPPLIER.phoneHQ} / 대구지사 ${SUPPLIER.phoneDaegu}</td></tr>
        <tr><td class="k">업 태</td><td>${SUPPLIER.bizType}</td><td class="k">종 목</td><td>${SUPPLIER.bizItem}</td></tr>
      </table>
    </div>
  </div>
  <div class="lead">아래와 같이 견적합니다.</div>
  <div class="sumband"><span class="lbl">합 계 금 액</span><div class="amt-bg"><span class="amt">일금 ${esc(d.koreanAmount)}원정(VAT별도) ( ${won(d.supplyPrice)}- )</span><span class="unit">(단위 : 원)</span></div></div>
  <table class="items">
    <thead><tr><th>품목코드 및 품목명</th><th>수 량</th><th>단 가</th><th>공급가액</th><th>비 고</th></tr></thead>
    <tbody>${itemRows}${incRows}${extraRows}
      <tr class="total"><td colspan="3">총　　계</td><td class="num">${won(d.supplyPrice)}</td><td></td></tr>
    </tbody>
  </table>
  ${specs}
  <div class="band">특 기 사 항</div>
  ${notes}
</div>
<div class="device">
  ${d.deviceNameDataUri ? `<img class="name-img" src="${d.deviceNameDataUri}">` : "<span></span>"}
  ${d.deviceImageDataUri ? `<img class="dev-img" src="${d.deviceImageDataUri}">` : "<span></span>"}
</div>
</body></html>`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @jhtechsaas/worker test -- quote-html`
Expected: PASS (자산 4종 포함, null 생략 테스트 포함 전체 통과).

- [ ] **Step 5: 커밋**

```bash
git add apps/worker/src/jobs/quote-html.ts apps/worker/src/jobs/quote-html.test.ts
git commit -m "feat: 견적서 양식 재구성(배경 레이어·좌상단 로고·하단 좌우 장비)"
```

---

## Task 4: quote-pdf.ts 자산 배선

**Files:**
- Modify: `apps/worker/src/jobs/quote-pdf.ts`

- [ ] **Step 1: import 추가**

`apps/worker/src/jobs/quote-pdf.ts` 4행 import를 교체:
```ts
import { getFontDataUri, getStampDataUri, getQuoteBgDataUri, getCompanyLogoDataUri } from "./assets";
```

- [ ] **Step 2: EquipmentRow 타입 + select 교체**

`EquipmentRow` 타입(38~42행)을:
```ts
type EquipmentRow = {
  quote_device_image: string | null;
  quote_device_name: string | null;
  specs: unknown;
};
```
equipment select 2곳(93행, 101행)의 `quote_banner_top, quote_banner_bottom` → `quote_device_name, quote_device_image`.
101행 select는 이름매칭용 `id, name, model`도 유지: `"id, name, model, quote_device_name, quote_device_image, specs"`.

- [ ] **Step 3: data 객체 자산 필드 교체**

`const data: QuoteHtmlData = {...}`(123행~)에서 `bannerTopDataUri`·`bannerBottomDataUri` 블록(139~148행)을 제거하고 아래로 교체:
```ts
    quoteBgDataUri: await getQuoteBgDataUri(),
    companyLogoDataUri: await getCompanyLogoDataUri(),
    deviceImageDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_device_image ?? null,
    ),
    deviceNameDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_device_name ?? null,
    ),
```

- [ ] **Step 4: 타입·단위테스트 확인**

Run: `pnpm --filter @jhtechsaas/worker typecheck && pnpm --filter @jhtechsaas/worker test -- quote`
Expected: PASS (quote-html·관련 단위 통과; 통합·크롬 테스트는 로컬 supabase 필요 시 별도).

- [ ] **Step 5: 커밋**

```bash
git add apps/worker/src/jobs/quote-pdf.ts
git commit -m "feat: 견적 PDF 잡에 새 자산(배경·로고·장비이미지·네임) 배선"
```

---

## Task 5: admin 장비 폼 — 새 자산 업로드 전환

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts`
- Modify: `apps/web/src/app/admin/equipment/actions.ts`
- Modify: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`
- Modify: `apps/web/src/app/admin/equipment/_components/BannerUploader.tsx`

- [ ] **Step 1: Zod schema 교체**

`apps/web/src/lib/equipment/schema.ts` 64~87행(`quote_banner_top`·`quote_banner_bottom` 블록)을 아래로 교체:
```ts
  // 견적서 장비 자산(좌하단 네임·우하단 이미지) Storage 객체 경로. 빈 문자열 허용(미설정).
  // 형식 강제(경로조작 방지·DB CHECK와 일치): equipment/{uuid}/device-(name|image).{ext}.
  quote_device_name: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^equipment\/[0-9a-f-]{36}\/device-name\.(jpg|jpeg|png|webp)$/i,
          "잘못된 장비 네임 경로",
        ),
    ])
    .default(""),
  quote_device_image: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^equipment\/[0-9a-f-]{36}\/device-image\.(jpg|jpeg|png|webp)$/i,
          "잘못된 장비 이미지 경로",
        ),
    ])
    .default(""),
```

- [ ] **Step 2: actions.ts 필드명 교체**

`apps/web/src/app/admin/equipment/actions.ts` 90~91행과 150~151행을:
```ts
    quote_device_name: v.quote_device_name || null,
    quote_device_image: v.quote_device_image || null,
```

- [ ] **Step 3: BannerUploader.tsx 전환**

`apps/web/src/app/admin/equipment/_components/BannerUploader.tsx`:
- `slot: "top" | "bottom"` → `slot: "name" | "image"`
- 상수 주석/이름 유지(`ALLOWED_BANNER_EXT` 그대로 사용 가능). 경로 줄을:
```ts
      const path = `equipment/${equipmentId}/device-${slot}.${ext}`;
```
- 라벨 줄(`견적서 {slot...} 배너`)을:
```tsx
      <span className="text-small text-muted">
        {slot === "name" ? "장비 네임 로고 (견적서 좌하단)" : "장비 이미지 (견적서 우하단)"}
      </span>
```
- `alt={`${slot} 배너`}` → `alt={slot === "name" ? "장비 네임" : "장비 이미지"}`

- [ ] **Step 4: EquipmentForm.tsx 전환**

`apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`:
- defaultValues(60~61행): `quote_device_name: ""`, `quote_device_image: ""`
- useController(76~82행): name을 `quote_device_name`(setDeviceName)·`quote_device_image`(setDeviceImage)로, 구조분해 변수도 `deviceName`/`deviceImage`로 rename
- §3-1 블록(220~236행)의 두 `BannerUploader`를:
```tsx
      {/* §3-1 견적서 장비 자산 — 좌하단 네임 / 우하단 이미지 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BannerUploader
          equipmentId={equipmentId}
          slot="name"
          value={deviceName ?? ""}
          onChange={setDeviceName}
          onUploadingChange={setUploading}
        />
        <BannerUploader
          equipmentId={equipmentId}
          slot="image"
          value={deviceImage ?? ""}
          onChange={setDeviceImage}
          onUploadingChange={setUploading}
        />
      </div>
```
주석(220행)도 갱신.

- [ ] **Step 5: typecheck + 단위 + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web test -- equipment && pnpm --filter web lint`
Expected: PASS. (`as any` 0 유지.)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/app/admin/equipment/actions.ts apps/web/src/app/admin/equipment/_components/BannerUploader.tsx apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx
git commit -m "feat: 장비 폼 견적 자산 업로드를 장비네임·이미지로 전환"
```

---

## Task 6: 시각 검증 하니스 + 렌더 루프 (조정)

**Files:**
- Create: `apps/worker/src/jobs/_render-sample.ts`

- [ ] **Step 1: 렌더 하니스 작성**

`apps/worker/src/jobs/_render-sample.ts` — 실제 워커 코드가 아닌 로컬 시각 검증용. 고정 자산은 `assets.ts`로, 장비 자산은 `~/Downloads/SG1625/`에서 직접 base64로 읽어 SG1625 샘플 견적을 렌더 → `/tmp/quote-sample.pdf` 저장:
```ts
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildQuotePdf } from "./render-quote-pdf";
import { getFontDataUri, getStampDataUri, getQuoteBgDataUri, getCompanyLogoDataUri } from "./assets";
import type { QuoteHtmlData } from "./quote-html";

async function fileUri(abs: string, mime: string): Promise<string> {
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  const dir = join(homedir(), "Downloads", "SG1625");
  const data: QuoteHtmlData = {
    quoteNo: "JHQ-20260615-001-V1",
    issuedDateLabel: "2026년 6월 15일",
    assigneeName: "대표 이무직",
    assigneePhone: "010-5347-8180",
    recipient: "예일아트",
    supplyPrice: 75_000_000,
    koreanAmount: "칠천오백만",
    items: [{ name: "멀티컷 에코 SG1625 Digital Cutter", qtyLabel: "1SET", unitPrice: 75_000_000, amount: 75_000_000 }],
    includedOptions: [{ name: "기본 3헤드(라우터 기본 포함)", qtyLabel: "1ea" }],
    extraOptions: [],
    specGroups: [{ group: "성능", items: [{ label: "최대 작업", value: "1600×2500mm" }, { label: "속도", value: "1500mm/s" }] }],
    notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
    quoteBgDataUri: await getQuoteBgDataUri(),
    companyLogoDataUri: await getCompanyLogoDataUri(),
    deviceImageDataUri: await fileUri(join(dir, "4_SG1625-new.png"), "image/png"),
    deviceNameDataUri: await fileUri(join(dir, "5_멀티컷SG1625-logo.png"), "image/png"),
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };
  const pdf = await buildQuotePdf(data);
  await writeFile("/tmp/quote-sample.pdf", pdf);
  console.log("wrote /tmp/quote-sample.pdf");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 렌더 실행**

Run: `cd apps/worker && npx tsx src/jobs/_render-sample.ts`
Expected: `wrote /tmp/quote-sample.pdf` (로컬 macOS는 `browser.ts`가 `channel:"chrome"` 사용).

- [ ] **Step 3: PDF 대조 (Read 도구)**

Read 도구로 `/tmp/quote-sample.pdf`를 열어 확인(⚠️ cat/grep 금지 — PNG/PDF 바이트 유입 차단). 체크리스트:
- 배경이 페이지 전체에 깔리고 본문 텍스트가 읽히는가(배경 위 가독성)
- 좌상단 로고 크기·위치가 적절한가
- 우상단 공급자 표/도장이 배경에 묻히지 않는가(반투명 배경 적용됨)
- 좌하단 장비 네임·우하단 장비 이미지가 조명 위에 자연스럽게 놓이는가
- 본문이 하단 장비 영역과 겹치지 않는가

- [ ] **Step 4: 수치 조정 반복**

`quote-html.ts`의 CSS 수치(`.logo` 폭/여백, `.device .name-img`/`.dev-img` 크기, 배경 위 흰 박스 투명도, 여백)를 Step 3 관찰에 따라 조정 → Step 2 재렌더 → Step 3 재확인. 만족할 때까지 반복. **변경마다 `quote-html.test.ts`가 깨지지 않는지** 확인(`pnpm --filter @jhtechsaas/worker test -- quote-html`).

- [ ] **Step 5: 커밋(조정 완료 후)**

```bash
git add apps/worker/src/jobs/_render-sample.ts apps/worker/src/jobs/quote-html.ts
git commit -m "feat: 견적서 시각 검증 하니스 + 자산 배치 수치 조정"
```

---

## Task 7: 전체 게이트

- [ ] **Step 1: 클린 DB + 시드**

Run:
```bash
supabase db reset
bash supabase/seed/seed-local.sh
```

- [ ] **Step 2: 전체 게이트 실행**

Run:
```bash
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
grep -rn "as any" apps packages --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "// " || echo "as any 0"
```
Expected: 모두 PASS, `as any` 0. (db-tests·e2e는 클린 reset+seed 상태에서만.)

- [ ] **Step 3: 최종 확인**

Run: `git log --oneline -8 && git status`
Expected: Task 1~6 커밋 존재, 워킹트리 clean. 이후 `/ship`으로 PR 생성(DB push는 머지 후 별도).

---

## Self-Review 결과

- **스펙 커버리지**: ① 데이터모델(banner→device)=Task 1 ② 고정 자산=Task 2 ③ 레이아웃 재작성=Task 3 ④ 잡 배선=Task 4 ⑤ admin 폼=Task 5 ⑥ 시각검증 루프=Task 6 ⑦ 게이트=Task 7. 스펙 모든 항목에 대응 task 존재.
- **Placeholder 스캔**: 코드 단계는 전부 실제 코드 포함. Task 6의 수치 조정만 의도적 반복(시각 작업 본질) — 초안 코드는 Task 3에 완비.
- **타입 일관성**: `QuoteHtmlData`의 자산 필드명(`quoteBgDataUri`·`companyLogoDataUri`·`deviceImageDataUri`·`deviceNameDataUri`)이 Task 3·4·6에서 동일. 컬럼명(`quote_device_name`·`quote_device_image`)·경로(`device-name`·`device-image`)·제약명(`equipment_quote_device_*_path`)이 Task 1·4·5에서 일관.
