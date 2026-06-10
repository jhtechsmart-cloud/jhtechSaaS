# 견적서 PDF 실제 양식 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발행 시 워커가 만드는 견적 PDF를, 영문 placeholder에서 **재현테크 실제 양식(장비별 상·하단 배너 + 동적 가운데)을 Puppeteer로 렌더한 진짜 견적서**로 교체한다.

**Architecture:** 기존 PDF 파이프라인(트리거→jobs 큐→워커→`quote-pdfs` 업로드→`pdf_url`)은 그대로. 워커의 `buildQuotePdf`(pdf-lib)를 **Puppeteer HTML→PDF**로 교체하고, 데이터 조회를 품목·옵션·신청기업·담당자·장비배너·specs까지 확장한다. 순수 로직(한글금액·매칭·HTML 생성)은 테스트 가능한 함수로 분리.

**Tech Stack:** Puppeteer(헤드리스 크롬, HTML→PDF) · TypeScript · pnpm 워크스페이스 · Vitest · Supabase(Postgres·Storage) · Next.js(관리자 UI).

---

## File Structure

| 파일 | 역할 | 종류 |
|---|---|---|
| `packages/shared/src/korean-amount.ts` (+test) | 숫자→한글금액(일금 ○○원정) 순수함수 | 생성 |
| `packages/shared/src/company.ts` | 공급자(재현테크) 고정 상수 | 생성 |
| `packages/shared/src/equipment-match.ts` (+test) | 이름 정규화 매칭(웹·워커 공유) | 생성 |
| `packages/shared/src/index.ts` | 신규 모듈 re-export | 수정 |
| `apps/web/src/lib/quotes/equipment-match.ts` | shared로 위임(web 호출부 보존) | 수정 |
| `supabase/migrations/20260610120000_quote_pdf_fields.sql` | equipment 배너 2컬럼 + profiles.phone | 생성 |
| `supabase/rollback/20260610120000_quote_pdf_fields_down.sql` | 롤백 | 생성 |
| `packages/db-tests/...` | 신규 컬럼 권한 단언 | 생성/수정 |
| `apps/worker/package.json` | puppeteer 의존성 | 수정 |
| `apps/worker/assets/` | 한글 폰트 TTF · 도장 이미지 | 생성(자산) |
| `apps/worker/src/jobs/browser.ts` | 크롬 싱글턴(1회 기동·재사용) | 생성 |
| `apps/worker/src/jobs/quote-html.ts` (+test) | `renderQuoteHtml(data)` 순수 템플릿 | 생성 |
| `apps/worker/src/jobs/render-quote-pdf.ts` (+test) | Puppeteer 렌더(HTML→PDF) | 수정 |
| `apps/worker/src/jobs/quote-pdf.ts` | 데이터 조립(quote+app+assignee+equipment) | 수정 |
| `apps/web/src/lib/equipment/schema.ts` | 배너 경로 필드 | 수정 |
| `apps/web/src/app/admin/equipment/actions.ts` | 배너 저장 | 수정 |
| `apps/web/src/app/admin/equipment/_components/BannerUploader.tsx` | 단일 배너 업로더 | 생성 |
| `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx` | 배너 슬롯 2칸 | 수정 |

**페이즈 순서**: A(순수 유틸·상수) → B(DB) → C(워커 렌더) → D(관리자 UI) → E(게이트). C가 가장 가치 큰 핵심.

---

## Phase A — 순수 유틸 · 상수 (인프라 없이 테스트 가능)

### Task 1: 한글 금액 유틸 `numberToKoreanAmount` (TDD)

견적서 헤드라인 "일금 **칠천오백만**원정(VAT별도)"에 쓸 숫자→한글 변환.

**Files:**
- Create: `packages/shared/src/korean-amount.ts`
- Test: `packages/shared/src/korean-amount.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`packages/shared/src/korean-amount.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { numberToKoreanAmount } from "./korean-amount";

describe("numberToKoreanAmount", () => {
  test("기본 변환", () => {
    expect(numberToKoreanAmount(75_000_000)).toBe("칠천오백만");
    expect(numberToKoreanAmount(48_000_000)).toBe("사천팔백만");
  });
  test("억·만 혼합", () => {
    expect(numberToKoreanAmount(120_000_000)).toBe("일억이천만");
    expect(numberToKoreanAmount(100_000_000)).toBe("일억");
  });
  test("천·백·십·일", () => {
    expect(numberToKoreanAmount(1_234)).toBe("일천이백삼십사");
    expect(numberToKoreanAmount(10_000)).toBe("일만");
  });
  test("0과 경계", () => {
    expect(numberToKoreanAmount(0)).toBe("영");
    expect(numberToKoreanAmount(5)).toBe("오");
    expect(numberToKoreanAmount(20)).toBe("이십");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- korean-amount`
Expected: FAIL — module/function 없음.

- [ ] **Step 3: 구현**

`packages/shared/src/korean-amount.ts`:
```ts
// 숫자 → 한글 금액(예: 75000000 → "칠천오백만"). 견적서 "일금 ○○원정"에 사용.
// 정수만 가정(원 단위). 음수·소수는 호출측에서 정수화.
const DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"]; // 4자리 블록 내 자리 단위
const BIG_UNITS = ["", "만", "억", "조", "경"]; // 4자리 블록 단위

// 4자리(0~9999) 블록을 한글로. 0이면 빈 문자열.
function readBlock(n: number): string {
  let out = "";
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(n / 10 ** pos) % 10;
    if (d === 0) continue;
    // '일십','일백','일천'에서 앞 '일' 생략 관례는 양식 가독상 유지(일천이백…) → 생략 안 함.
    out += DIGITS[d] + SMALL_UNITS[pos];
  }
  return out;
}

export function numberToKoreanAmount(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "영";
  const blocks: string[] = [];
  let rest = n;
  let unitIdx = 0;
  while (rest > 0) {
    const block = rest % 10000;
    if (block > 0) blocks.unshift(readBlock(block) + BIG_UNITS[unitIdx]);
    rest = Math.floor(rest / 10000);
    unitIdx++;
  }
  return blocks.join("");
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- korean-amount`
Expected: PASS.

- [ ] **Step 5: index.ts에 export 추가**

`packages/shared/src/index.ts`의 export 목록 끝에 추가:
```ts
export * from "./korean-amount";
```

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/korean-amount.ts packages/shared/src/korean-amount.test.ts packages/shared/src/index.ts
git commit -m "feat: 숫자→한글금액 유틸 numberToKoreanAmount (shared)"
```

---

### Task 2: 공급자 상수 `SUPPLIER` (shared)

견적서 공급자 박스 고정정보. 두 양식에서 읽은 값. 워커·web 공유 위해 shared에.

**Files:**
- Create: `packages/shared/src/company.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 상수 작성**

`packages/shared/src/company.ts`:
```ts
// (주)재현테크 공급자 고정정보 — 견적서 공급자 박스. 출처: 실제 발행 견적서 2종.
export const SUPPLIER = {
  bizNo: "113-81-80804",
  name: "(주)재현테크",
  ceo: "이무직",
  address: "서울시 구로구 구로동 235-2 에이스하이앤드타워 705호",
  phoneHQ: "02-839-7723", // 서울본사
  phoneDaegu: "053-650-7723", // 대구지사
  bizType: "제조, 도소매, 도매", // 업태
  bizItem: "인쇄, 인쇄기기 외", // 종목
} as const;
```

- [ ] **Step 2: index.ts export 추가**

`packages/shared/src/index.ts` 끝에:
```ts
export * from "./company";
```

- [ ] **Step 3: 타입체크 + 커밋**

Run: `pnpm --filter @jhtechsaas/shared typecheck`
Expected: PASS.
```bash
git add packages/shared/src/company.ts packages/shared/src/index.ts
git commit -m "feat: 공급자(재현테크) 상수 SUPPLIER (shared)"
```

---

### Task 3: 장비 이름매칭을 shared로 (웹·워커 공유, TDD)

워커가 견적 메인품목으로 장비(배너·specs)를 찾을 때 web과 동일한 매칭을 쓰도록 순수 매칭을 shared로 이동. web 호출부는 re-export로 보존.

**Files:**
- Create: `packages/shared/src/equipment-match.ts`
- Test: `packages/shared/src/equipment-match.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/lib/quotes/equipment-match.ts`

- [ ] **Step 1: 실패 테스트**

`packages/shared/src/equipment-match.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { matchEquipmentName } from "./equipment-match";

const list = [
  { name: "롤 UV 프린터 (1.6m)", model: "XTRA R16" },
  { name: "멀티컷 에코 SG1625 Digital Cutter", model: "SG1625" },
];

describe("matchEquipmentName", () => {
  test("이름 정규화 매칭(공백·기호 무시)", () => {
    expect(matchEquipmentName("롤 UV 프린터(1.6m)", list)?.model).toBe("XTRA R16");
  });
  test("모델명 매칭", () => {
    expect(matchEquipmentName("SG1625", list)?.model).toBe("SG1625");
  });
  test("미매칭은 null", () => {
    expect(matchEquipmentName("없는장비", list)).toBeNull();
    expect(matchEquipmentName("", list)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- equipment-match`
Expected: FAIL.

- [ ] **Step 3: 구현(웹의 기존 순수 로직을 그대로 이동)**

`packages/shared/src/equipment-match.ts`:
```ts
// 견적 item 이름을 장비 카탈로그(name/model)와 best-effort 매칭. 견적 item은 equipment_id를
// 스냅샷이라 저장 안 해 이름으로 추정. 웹(견적 프레임)·워커(견적 PDF) 공유.
// 소문자 + 영숫자/한글만(공백·하이픈·기호 제거).
export function normalizeEquipmentKey(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

export function matchEquipmentName<T extends { name: string; model: string | null }>(
  itemName: string,
  list: T[],
): T | null {
  const key = normalizeEquipmentKey(itemName);
  if (key === "") return null;
  return (
    list.find((e) => normalizeEquipmentKey(e.name) === key || (e.model != null && normalizeEquipmentKey(e.model) === key)) ??
    null
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jhtechsaas/shared test -- equipment-match`
Expected: PASS.

- [ ] **Step 5: shared index export + web 위임**

`packages/shared/src/index.ts` 끝에:
```ts
export * from "./equipment-match";
```

`apps/web/src/lib/quotes/equipment-match.ts` 전체를 아래로 교체(web-specific 타입은 유지, 함수는 shared 재export):
```ts
// 매칭 순수 로직은 @jhtechsaas/shared로 이동(웹·워커 공유). 호출부 보존 위해 re-export.
export { matchEquipmentName, normalizeEquipmentKey } from "@jhtechsaas/shared";

// 견적 프레임에서 쓰는 web 측 장비 타입(카탈로그 표시·예상가). shared 매칭과 호환.
export type MatchableEquipment = {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
  basePrice: number;
};
```

- [ ] **Step 6: web 타입체크(위임이 호출부를 안 깨는지)**

Run: `pnpm --filter web typecheck`
Expected: PASS. (실패 시: 기존 `equipment-match`에서 import하던 다른 export가 있었는지 확인 — `git show HEAD:apps/web/src/lib/quotes/equipment-match.ts`로 원본 대조해 누락분을 위 파일에 보존.)

- [ ] **Step 7: 커밋**

```bash
git add packages/shared/src/equipment-match.ts packages/shared/src/equipment-match.test.ts packages/shared/src/index.ts apps/web/src/lib/quotes/equipment-match.ts
git commit -m "refactor: 장비 이름매칭 순수로직 shared 이동(웹·워커 공유)"
```

---

## Phase B — DB

### Task 4: 마이그레이션 — equipment 배너 2컬럼 + profiles.phone

**Files:**
- Create: `supabase/migrations/20260610120000_quote_pdf_fields.sql`
- Create: `supabase/rollback/20260610120000_quote_pdf_fields_down.sql`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260610120000_quote_pdf_fields.sql`:
```sql
-- 견적서 PDF — 장비별 견적서 배너 2종(상·하단) + 담당자 전화.
-- 배너 경로는 equipment-images 버킷 객체 경로. nullable(없으면 PDF에서 생략).

alter table public.equipment
  add column if not exists quote_banner_top text,
  add column if not exists quote_banner_bottom text;

-- 담당자 전화(견적서 담당자 라인). nullable.
alter table public.profiles
  add column if not exists phone text;

-- 경로 형식 가드(임의경로 차단): equipment/{uuid}/banner-(top|bottom).{ext}
alter table public.equipment
  add constraint equipment_quote_banner_top_path
    check (quote_banner_top is null or quote_banner_top ~ '^equipment/[0-9a-f-]{36}/banner-top\.(jpg|jpeg|png|webp)$'),
  add constraint equipment_quote_banner_bottom_path
    check (quote_banner_bottom is null or quote_banner_bottom ~ '^equipment/[0-9a-f-]{36}/banner-bottom\.(jpg|jpeg|png|webp)$');
```

- [ ] **Step 2: 롤백 작성**

`supabase/rollback/20260610120000_quote_pdf_fields_down.sql`:
```sql
alter table public.equipment
  drop constraint if exists equipment_quote_banner_top_path,
  drop constraint if exists equipment_quote_banner_bottom_path,
  drop column if exists quote_banner_top,
  drop column if exists quote_banner_bottom;
alter table public.profiles drop column if exists phone;
```

- [ ] **Step 3: 로컬 적용 검증**

Run: `supabase db reset && bash supabase/seed/seed-local.sh`
Expected: 마이그레이션 에러 없이 적용 완료, 시드 성공.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260610120000_quote_pdf_fields.sql supabase/rollback/20260610120000_quote_pdf_fields_down.sql
git commit -m "feat: 마이그레이션 — equipment 견적서 배너 2컬럼 + profiles.phone"
```

---

### Task 5: db-test — 신규 컬럼 권한 단언

**Files:**
- Create: `packages/db-tests/src/quote-pdf-fields.test.ts` (기존 db-test 파일 구조를 먼저 1개 열어 import·헬퍼 패턴을 그대로 따른다)

- [ ] **Step 1: 기존 db-test 패턴 확인**

Run: `ls packages/db-tests/src && sed -n '1,40p' "$(ls packages/db-tests/src/*.test.ts | head -1)"`
Expected: pg 클라이언트로 `set role` + `request.jwt.claims`를 세팅해 권한별 단언하는 패턴 확인. 그 import·헬퍼(예: `withRole`, admin 클레임 생성기)를 신규 테스트에 동일하게 사용.

- [ ] **Step 2: 테스트 작성(패턴 일치)**

`packages/db-tests/src/quote-pdf-fields.test.ts` — 위에서 확인한 헬퍼로:
```ts
// equipment 배너 컬럼·profiles.phone가 적절 권한으로 read/write 되는지 + 경로 CHECK 동작.
import { describe, expect, test } from "vitest";
// ↓ 기존 db-test 파일과 동일한 헬퍼 import 경로로 교체(Step 1에서 확인).
import { adminClient } from "./helpers"; // 예시 — 실제 헬퍼명/경로로 맞출 것

describe("견적서 PDF 신규 컬럼", () => {
  test("equipment 배너 경로 — 유효 경로 UPDATE 성공", async () => {
    const c = await adminClient();
    // 활성 장비 1건 id 조회 후 유효 배너 경로 업데이트
    const { rows } = await c.query("select id from public.equipment limit 1");
    const id = rows[0].id;
    const path = `equipment/${id}/banner-top.png`;
    await expect(
      c.query("update public.equipment set quote_banner_top=$1 where id=$2", [path, id]),
    ).resolves.toBeDefined();
  });

  test("equipment 배너 경로 — 잘못된 경로는 CHECK 위반", async () => {
    const c = await adminClient();
    const { rows } = await c.query("select id from public.equipment limit 1");
    const id = rows[0].id;
    await expect(
      c.query("update public.equipment set quote_banner_top=$1 where id=$2", ["../evil.png", id]),
    ).rejects.toThrow();
  });

  test("profiles.phone — 본인 행 UPDATE 허용", async () => {
    const c = await adminClient();
    await expect(
      c.query("update public.profiles set phone='02-839-7723' where id = (auth.uid())"),
    ).resolves.toBeDefined();
  });
});
```

> ⚠️ 위 코드의 `adminClient`/쿼리 헬퍼는 **Step 1에서 확인한 실제 db-test 헬퍼**로 정확히 맞춰라(이 레포의 패턴이 import·롤 세팅이 다를 수 있다). 단언 의도(유효경로 OK·잘못된경로 CHECK 실패·phone 업데이트 OK)는 유지.

- [ ] **Step 3: 클린 DB에서 실행**

Run: `supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests test:rls -- quote-pdf-fields`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add packages/db-tests/src/quote-pdf-fields.test.ts
git commit -m "test: equipment 배너·profiles.phone db-test"
```

---

## Phase C — 워커 렌더 (핵심)

### Task 6: puppeteer 의존성 + 한글 폰트·도장 자산 + 크롬 싱글턴

**Files:**
- Modify: `apps/worker/package.json`
- Create: `apps/worker/assets/PretendardJP-Regular.subset.ttf` (또는 NotoSansKR — 오픈소스 TTF 다운로드해 배치)
- Create: `apps/worker/assets/stamp.png` (Seonje 제공 도장; 없으면 1x1 투명 PNG로 임시 두고 구현 진행, QA 전 교체)
- Create: `apps/worker/src/jobs/browser.ts`

- [ ] **Step 1: puppeteer 설치**

Run:
```bash
cd /Users/seonjecho/Projects/jhtechSaaS && pnpm --filter worker add puppeteer
```
Expected: `apps/worker/package.json` dependencies에 `puppeteer` 추가, Chromium 다운로드 완료.

- [ ] **Step 2: 한글 폰트 TTF 배치**

오픈소스 한글 폰트(Pretendard 또는 Noto Sans KR) Regular TTF를 `apps/worker/assets/`에 둔다. (라이선스: Pretendard=OFL/Noto=OFL, 재배포 가능.) 파일명을 코드에서 참조할 경로로 고정.
Run(예시, Noto Sans KR):
```bash
mkdir -p apps/worker/assets
curl -L -o apps/worker/assets/NotoSansKR-Regular.ttf "https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf" || echo "수동 배치 필요"
```
(otf/ttf 어느 쪽이든 `@font-face`에 base64로 임베드. 다운로드 실패 시 수동으로 TTF 배치.)

- [ ] **Step 3: 도장 자산**

`apps/worker/assets/stamp.png` — Seonje 제공본. 아직 없으면 빈 1x1 투명 PNG를 두고(렌더 깨짐 방지), QA 전 실제 도장으로 교체. (계획상 자산 입력 항목.)

- [ ] **Step 4: 크롬 싱글턴 작성**

`apps/worker/src/jobs/browser.ts`:
```ts
import puppeteer, { type Browser } from "puppeteer";

// 상주 워커 — 크롬을 1회 기동해 잡마다 재사용(콜드스타트 1회). 페이지는 잡마다 생성·close.
let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
```

- [ ] **Step 5: 타입체크 + 커밋**

Run: `pnpm --filter worker typecheck`
Expected: PASS.
```bash
git add apps/worker/package.json apps/worker/assets apps/worker/src/jobs/browser.ts ../../pnpm-lock.yaml 2>/dev/null; git add -A apps/worker
git commit -m "feat: 워커 puppeteer 의존성 + 한글폰트·도장 자산 + 크롬 싱글턴"
```

---

### Task 7: `renderQuoteHtml` 순수 템플릿 함수 (TDD)

견적 데이터 → 견적서 HTML 문자열. 순수 함수(테스트 가능). 자산(폰트·도장·배너)은 호출측이 data로 주입(base64 data-URI 또는 경로).

**Files:**
- Create: `apps/worker/src/jobs/quote-html.ts`
- Test: `apps/worker/src/jobs/quote-html.test.ts`

- [ ] **Step 1: 입력 타입 + 실패 테스트**

`apps/worker/src/jobs/quote-html.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { renderQuoteHtml, type QuoteHtmlData } from "./quote-html";

const base: QuoteHtmlData = {
  quoteNo: "JHQ-20260607-001-V1",
  issuedDateLabel: "2026년 5월 29일",
  assigneeName: "대표 이무직",
  assigneePhone: "010-5347-8180",
  recipient: "예일아트",
  supplyPrice: 75_000_000,
  koreanAmount: "칠천오백만",
  items: [{ name: "멀티컷 에코 SG1625 Digital Cutter", qtyLabel: "1SET", unitPrice: 75_000_000, amount: 75_000_000 }],
  includedOptions: [{ name: "기본 3헤드(라우터 기본 포함)", qtyLabel: "1ea" }],
  extraOptions: [],
  specGroups: [],
  notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
  bannerTopDataUri: null,
  bannerBottomDataUri: null,
  stampDataUri: "data:image/png;base64,AAAA",
  fontDataUri: "data:font/ttf;base64,AAAA",
};

describe("renderQuoteHtml", () => {
  test("핵심 데이터가 HTML에 포함된다", () => {
    const html = renderQuoteHtml(base);
    expect(html).toContain("JHQ-20260607-001-V1");
    expect(html).toContain("예일아트");
    expect(html).toContain("일금 칠천오백만원정");
    expect(html).toContain("75,000,000");
    expect(html).toContain("멀티컷 에코 SG1625");
    expect(html).toContain("113-81-80804"); // 공급자
  });
  test("포함옵션은 '포함'으로, 추가옵션은 금액으로 렌더", () => {
    const html = renderQuoteHtml({
      ...base,
      extraOptions: [{ name: "추가 헤드", qtyLabel: "2ea", unitPrice: 1_000_000, amount: 2_000_000 }],
    });
    expect(html).toContain("기본 3헤드(라우터 기본 포함)");
    expect(html).toMatch(/포함/);
    expect(html).toContain("추가 헤드");
    expect(html).toContain("2,000,000");
  });
  test("specGroups 없으면 장비사양 섹션 미출력", () => {
    expect(renderQuoteHtml(base)).not.toContain("장비사양");
    const withSpecs = renderQuoteHtml({ ...base, specGroups: [{ group: "성능", items: [{ label: "해상도", value: "1200DPI" }] }] });
    expect(withSpecs).toContain("장비사양");
    expect(withSpecs).toContain("1200DPI");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter worker test -- quote-html`
Expected: FAIL.

- [ ] **Step 3: 구현(기준 템플릿)**

`apps/worker/src/jobs/quote-html.ts` — 데이터 바인딩이 정확한 기준 템플릿. 시각 미세조정은 Task 10(실물 대조)에서. `SUPPLIER` 상수 사용:
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
  bannerTopDataUri: string | null;
  bannerBottomDataUri: string | null;
  stampDataUri: string;
  fontDataUri: string;
};

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
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
@font-face{font-family:'KR';src:url(${d.fontDataUri});}
@page{size:A4;margin:0;}
*{box-sizing:border-box;margin:0;padding:0;font-family:'KR',sans-serif;}
body{width:210mm;color:#111;font-size:11px;}
.banner{width:100%;display:block;}
.pad{padding:0 14mm;}
.head{display:flex;justify-content:space-between;margin-top:8px;}
.meta div{line-height:1.7;}
.supplier{border:1px solid #333;font-size:10px;position:relative;min-width:88mm;}
.supplier .title{background:#eee;text-align:center;letter-spacing:6px;border-bottom:1px solid #333;}
.supplier table{width:100%;border-collapse:collapse;}
.supplier td{border:1px solid #999;padding:2px 5px;}
.stamp{position:absolute;right:8px;top:18px;width:54px;opacity:.95;}
.recipient{font-size:20px;font-weight:700;border-bottom:2px solid #111;display:inline-block;margin:14px 0 6px;padding-bottom:2px;}
.lead{margin:6px 0;}
.sumband{display:flex;align-items:center;gap:12px;margin:6px 0;}
.sumband .lbl{background:#3a4a5a;color:#fff;font-weight:700;letter-spacing:4px;padding:6px 14px;}
.sumband .amt{font-size:15px;font-weight:700;}
table.items{width:100%;border-collapse:collapse;margin-top:4px;}
table.items th,table.items td{border:1px solid #333;padding:4px 6px;text-align:center;}
table.items th{background:#f3f3f3;}
table.items td.name{text-align:left;}
table.items td.num{text-align:right;font-variant-numeric:tabular-nums;}
table.items tr.total td{font-weight:700;}
.band{background:#3a4a5a;color:#fff;text-align:center;letter-spacing:6px;padding:5px;margin-top:12px;}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;padding:8px 2px;}
.spec-title{font-weight:700;margin-top:4px;}
.note{margin:2px 0;color:#333;}
</style></head><body>
${d.bannerTopDataUri ? `<img class="banner" src="${d.bannerTopDataUri}">` : ""}
<div class="pad">
  <div class="head">
    <div class="meta">
      <div>견 적 일 자 : ${esc(d.issuedDateLabel)}</div>
      <div>견 적 번 호 : ${esc(d.quoteNo)}</div>
      <div>담 당 자 명 : ${esc(d.assigneeName)}</div>
      ${d.assigneePhone ? `<div>　　　　　　　${esc(d.assigneePhone)}</div>` : ""}
    </div>
    <div class="supplier">
      <div class="title">공 급 자</div>
      <img class="stamp" src="${d.stampDataUri}">
      <table>
        <tr><td>등록번호</td><td colspan="3">${SUPPLIER.bizNo}</td></tr>
        <tr><td>상 호</td><td>${SUPPLIER.name}</td><td>성 명</td><td>${SUPPLIER.ceo}</td></tr>
        <tr><td>주 소</td><td colspan="3">${SUPPLIER.address}<br>서울본사 ${SUPPLIER.phoneHQ} / 대구지사 ${SUPPLIER.phoneDaegu}</td></tr>
        <tr><td>업 태</td><td>${SUPPLIER.bizType}</td><td>종 목</td><td>${SUPPLIER.bizItem}</td></tr>
      </table>
    </div>
  </div>
  <div><span class="recipient">${esc(d.recipient)} 귀하</span></div>
  <div class="lead">아래와 같이 견적합니다.</div>
  <div class="sumband"><span class="lbl">합 계 금 액</span><span class="amt">일금 ${esc(d.koreanAmount)}원정(VAT별도) ( ${won(d.supplyPrice)}- )</span><span>(단위 : 원)</span></div>
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
${d.bannerBottomDataUri ? `<img class="banner" src="${d.bannerBottomDataUri}">` : ""}
</body></html>`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter worker test -- quote-html`
Expected: PASS (3 테스트).

- [ ] **Step 5: 커밋**

```bash
git add apps/worker/src/jobs/quote-html.ts apps/worker/src/jobs/quote-html.test.ts
git commit -m "feat: 견적서 HTML 템플릿 renderQuoteHtml (순수, TDD)"
```

---

### Task 8: `buildQuotePdf`를 Puppeteer 렌더로 교체

**Files:**
- Modify: `apps/worker/src/jobs/render-quote-pdf.ts`
- Modify: `apps/worker/src/jobs/render-quote-pdf.test.ts`

- [ ] **Step 1: render-quote-pdf.ts 교체**

`apps/worker/src/jobs/render-quote-pdf.ts` 전체 교체:
```ts
import { getBrowser } from "./browser";
import { renderQuoteHtml, type QuoteHtmlData } from "./quote-html";

// 견적 HTML(renderQuoteHtml) → 크롬 print-to-PDF. 상주 크롬 재사용, 페이지는 잡마다 생성·close.
export async function buildQuotePdf(data: QuoteHtmlData): Promise<Uint8Array> {
  const html = renderQuoteHtml(data);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 2: 테스트 갱신(유효 PDF 산출)**

`apps/worker/src/jobs/render-quote-pdf.test.ts` 전체 교체:
```ts
import { describe, expect, test, afterAll } from "vitest";
import { buildQuotePdf } from "./render-quote-pdf";
import { closeBrowser } from "./browser";
import type { QuoteHtmlData } from "./quote-html";

const data: QuoteHtmlData = {
  quoteNo: "JHQ-20260607-001-V1",
  issuedDateLabel: "2026년 6월 7일",
  assigneeName: "대표 이무직",
  assigneePhone: "010-5347-8180",
  recipient: "테스트상사",
  supplyPrice: 55_000_000,
  koreanAmount: "오천오백만",
  items: [{ name: "테스트 장비", qtyLabel: "1SET", unitPrice: 55_000_000, amount: 55_000_000 }],
  includedOptions: [],
  extraOptions: [],
  specGroups: [],
  notes: ["부가세 별도"],
  bannerTopDataUri: null,
  bannerBottomDataUri: null,
  stampDataUri: "data:image/png;base64,iVBORw0KGgo=",
  fontDataUri: "data:font/ttf;base64,AAAA",
};

afterAll(async () => {
  await closeBrowser();
});

describe("buildQuotePdf — Puppeteer 렌더", () => {
  test("유효한 PDF 바이트(%PDF 헤더)를 만든다", async () => {
    const pdf = await buildQuotePdf(data);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  }, 30_000); // 크롬 기동 여유
});
```

- [ ] **Step 3: 실행(로컬 크롬 필요)**

Run: `pnpm --filter worker test -- render-quote-pdf`
Expected: PASS(%PDF). 크롬 기동에 수 초. (CI에 크롬 없으면 이 테스트는 로컬 게이트 전용 — Task 11 참고.)

- [ ] **Step 4: 커밋**

```bash
git add apps/worker/src/jobs/render-quote-pdf.ts apps/worker/src/jobs/render-quote-pdf.test.ts
git commit -m "feat: 견적 PDF 렌더를 Puppeteer(HTML→PDF)로 교체"
```

---

### Task 9: `processQuotePdfJob` 데이터 조립

견적 PDF에 필요한 모든 데이터를 service_role로 조회·조립해 `buildQuotePdf`에 넘긴다. 자산(폰트·도장)은 워커 파일에서 base64로, 배너는 스토리지에서 base64로.

**Files:**
- Modify: `apps/worker/src/jobs/quote-pdf.ts`
- Create: `apps/worker/src/jobs/assets.ts` (폰트·도장 base64 로더 — 1회 캐시)

- [ ] **Step 1: 자산 로더**

`apps/worker/src/jobs/assets.ts`:
```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 워커 번들 자산(폰트·도장)을 base64 data-URI로 1회 로드해 캐시.
let fontUri: string | null = null;
let stampUri: string | null = null;

async function toDataUri(relPath: string, mime: string): Promise<string> {
  const abs = fileURLToPath(new URL(`../../assets/${relPath}`, import.meta.url));
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function getFontDataUri(): Promise<string> {
  if (!fontUri) fontUri = await toDataUri("NotoSansKR-Regular.ttf", "font/ttf");
  return fontUri;
}
export async function getStampDataUri(): Promise<string> {
  if (!stampUri) stampUri = await toDataUri("stamp.png", "image/png");
  return stampUri;
}
```
> 폰트 파일명(`NotoSansKR-Regular.ttf`)·도장(`stamp.png`)은 Task 6에서 배치한 실제 파일명과 일치시킬 것.

- [ ] **Step 2: quote-pdf.ts 데이터 조립으로 교체**

`apps/worker/src/jobs/quote-pdf.ts` 전체 교체:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchEquipmentName, numberToKoreanAmount } from "@jhtechsaas/shared";
import { buildQuotePdf } from "./render-quote-pdf";
import { getFontDataUri, getStampDataUri } from "./assets";
import type { QuoteHtmlData, QuoteHtmlItem, QuoteHtmlIncluded } from "./quote-html";

type QuoteLine = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra" };

// 견적 줄(jsonb) → 타입 보정.
function parseLines(v: unknown): QuoteLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      name: typeof r.name === "string" ? r.name : "",
      unitPrice: Number(r.unitPrice) || 0,
      quantity: Number(r.quantity) || 0,
      kind: r.kind === "included" || r.kind === "extra" ? r.kind : undefined,
    }));
}

// 스토리지 객체 → base64 data-URI(없으면 null).
async function storageDataUri(supabase: SupabaseClient, bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function processQuotePdfJob(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const quoteId = typeof payload.quote_id === "string" ? payload.quote_id : null;
  if (!quoteId) throw new Error("payload.quote_id 누락");

  // 1) 견적 + 신청기업 + 담당자
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_no, version, items, options, supply_price, issued_at, application_id, " +
        "assignee:assignee_id(name, phone), application:application_id(company, equipment_id)",
    )
    .eq("id", quoteId)
    .single();
  if (error || !quote) throw new Error(`견적 조회 실패: ${error?.message ?? "없음"}`);

  const app = (quote as Record<string, unknown>).application as { company?: string; equipment_id?: string | null } | null;
  const assignee = (quote as Record<string, unknown>).assignee as { name?: string; phone?: string | null } | null;

  const items = parseLines((quote as Record<string, unknown>).items);
  const allOptions = parseLines((quote as Record<string, unknown>).options);
  const includedOptions: QuoteHtmlIncluded[] = allOptions
    .filter((o) => o.kind === "included")
    .map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea` }));
  const extraOptions: QuoteHtmlItem[] = allOptions
    .filter((o) => o.kind !== "included")
    .map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea`, unitPrice: o.unitPrice, amount: o.unitPrice * o.quantity }));
  const htmlItems: QuoteHtmlItem[] = items.map((it) => ({
    name: it.name,
    qtyLabel: it.quantity === 1 ? "1SET" : `${it.quantity}SET`,
    unitPrice: it.unitPrice,
    amount: it.unitPrice * it.quantity,
  }));

  // 2) 장비(배너·specs): application.equipment_id 우선, 없으면 메인품목 이름매칭
  let equipment: { quote_banner_top: string | null; quote_banner_bottom: string | null; specs: unknown } | null = null;
  if (app?.equipment_id) {
    const { data } = await supabase.from("equipment").select("quote_banner_top, quote_banner_bottom, specs").eq("id", app.equipment_id).single();
    equipment = data ?? null;
  }
  if (!equipment && items[0]) {
    const { data: all } = await supabase.from("equipment").select("id, name, model, quote_banner_top, quote_banner_bottom, specs").eq("status", "active");
    const m = matchEquipmentName(items[0].name, (all ?? []) as { name: string; model: string | null }[]);
    if (m) equipment = m as typeof equipment;
  }

  // specs(jsonb SpecGroup[]) → 평면 그룹(label/value). 형식 방어.
  const specGroups = Array.isArray(equipment?.specs)
    ? (equipment!.specs as { group?: string; items?: { label?: string; value?: string }[] }[])
        .map((g) => ({ group: typeof g.group === "string" ? g.group : "", items: (g.items ?? []).map((i) => ({ label: i.label ?? "", value: i.value ?? "" })) }))
        .filter((g) => g.items.length > 0)
    : [];

  const supplyPrice = Number((quote as Record<string, unknown>).supply_price) || 0;
  const issued = typeof (quote as Record<string, unknown>).issued_at === "string" ? ((quote as Record<string, unknown>).issued_at as string) : null;
  const issuedDateLabel = issued
    ? `${issued.slice(0, 4)}년 ${Number(issued.slice(5, 7))}월 ${Number(issued.slice(8, 10))}일`
    : "";

  const data: QuoteHtmlData = {
    quoteNo: (quote as Record<string, unknown>).quote_no as string,
    issuedDateLabel,
    assigneeName: assignee?.name ?? "담당자",
    assigneePhone: assignee?.phone ?? null,
    recipient: app?.company ?? "",
    supplyPrice,
    koreanAmount: numberToKoreanAmount(supplyPrice),
    items: htmlItems,
    includedOptions,
    extraOptions,
    specGroups,
    notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
    bannerTopDataUri: await storageDataUri(supabase, "equipment-images", equipment?.quote_banner_top ?? null),
    bannerBottomDataUri: await storageDataUri(supabase, "equipment-images", equipment?.quote_banner_bottom ?? null),
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };

  // 3) 렌더 → 업로드 → pdf_url
  const pdf = await buildQuotePdf(data);
  const path = `${quoteId}.pdf`;
  const up = await supabase.storage.from("quote-pdfs").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);
  const { error: uErr } = await supabase.from("quotes").update({ pdf_url: path }).eq("id", quoteId);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
```
> ⚠️ `quotes.assignee_id` 조인 alias·컬럼명은 실제 스키마와 일치시켜라(`assignee:assignee_id(name, phone)`·`application:application_id(company, equipment_id)`). `select` 실패 시 컬럼명을 `apps/web/src/lib/quotes/queries.ts`의 getQuote와 대조.

- [ ] **Step 3: 타입체크 + 통합테스트**

Run: `pnpm --filter worker typecheck && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter worker test`
Expected: typecheck PASS. 통합테스트(runner)는 로컬 supabase + 크롬으로 발행→잡→PDF→pdf_url 증명. (기존 `runner.integration.test.ts`가 quote 시드 후 처리 검증 — 새 조인 컬럼으로 깨지면 시드 데이터에 company/assignee 보강.)

- [ ] **Step 4: 커밋**

```bash
git add apps/worker/src/jobs/quote-pdf.ts apps/worker/src/jobs/assets.ts
git commit -m "feat: 견적 PDF 데이터 조립(품목·옵션·신청기업·담당자·장비배너·specs)"
```

---

## Phase D — 관리자 배너 업로드 UI

### Task 10: 장비 화면 배너 업로드 2칸 + 저장

**Files:**
- Modify: `apps/web/src/lib/equipment/schema.ts`
- Modify: `apps/web/src/app/admin/equipment/actions.ts`
- Create: `apps/web/src/app/admin/equipment/_components/BannerUploader.tsx`
- Modify: `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`

- [ ] **Step 1: 스키마에 배너 필드 추가**

`apps/web/src/lib/equipment/schema.ts`의 `equipmentFormSchema` 객체에 필드 추가(경로 형식 강제):
```ts
  quote_banner_top: z
    .union([z.literal(""), z.string().regex(/^equipment\/[0-9a-f-]{36}\/banner-top\.(jpg|jpeg|png|webp)$/i, "잘못된 배너 경로")])
    .default(""),
  quote_banner_bottom: z
    .union([z.literal(""), z.string().regex(/^equipment\/[0-9a-f-]{36}\/banner-bottom\.(jpg|jpeg|png|webp)$/i, "잘못된 배너 경로")])
    .default(""),
```

- [ ] **Step 2: actions에 저장 추가**

`apps/web/src/app/admin/equipment/actions.ts`의 `createEquipment` insert와 `updateEquipment` update 객체에 각각 추가(`v`는 검증된 폼값, 빈 문자열은 null로):
```ts
      quote_banner_top: v.quote_banner_top || null,
      quote_banner_bottom: v.quote_banner_bottom || null,
```
(insert는 `.from("equipment").insert({ ... , quote_banner_top: v.quote_banner_top || null, quote_banner_bottom: v.quote_banner_bottom || null })`, update도 동일 키 추가.)

- [ ] **Step 3: 단일 배너 업로더**

`apps/web/src/app/admin/equipment/_components/BannerUploader.tsx` — `ImageUploader`의 storage 업로드 방식을 참고하되 단일 슬롯·고정 파일명(`banner-top`/`banner-bottom`):
```tsx
"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { validateImageFile, publicImageUrl } from "@/lib/equipment/images";

type Props = {
  equipmentId: string;
  slot: "top" | "bottom";
  value: string; // 경로 or ""
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void;
};

// 견적서 배너 단일 업로더 — equipment-images/equipment/{id}/banner-{slot}.{ext}. 덮어쓰기.
export function BannerUploader({ equipmentId, slot, value, onChange, onUploadingChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  async function handle(file: File) {
    const v = validateImageFile(file);
    if (v) { setError(v); return; }
    setError(null);
    onUploadingChange(true);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const path = `equipment/${equipmentId}/banner-${slot}.${ext === "jpeg" ? "jpg" : ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage.from("equipment-images").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) { setError(upErr.message); return; }
      onChange(path);
    } finally {
      onUploadingChange(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-small text-muted">견적서 {slot === "top" ? "상단" : "하단"} 배너</span>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={publicImageUrl(value)} alt={`${slot} 배너`} className="w-full rounded-sm border border-border" />
      )}
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
        className="text-small" />
      {error && <span className="text-small text-danger">{error}</span>}
    </div>
  );
}
```
> `validateImageFile`·`publicImageUrl`의 실제 시그니처를 `apps/web/src/lib/equipment/images.ts`에서 확인해 맞출 것(없는 헬퍼면 ImageUploader가 쓰는 동등 함수로 대체).

- [ ] **Step 4: EquipmentForm에 슬롯 2개 배선**

`EquipmentForm.tsx`에서 RHF로 `quote_banner_top`/`quote_banner_bottom`을 등록하고(기본값 `""`), 사진 업로더 근처에 `BannerUploader` 2개 추가. 업로딩 상태는 기존 저장 가드(`onUploadingChange`)에 합류:
```tsx
import { BannerUploader } from "./BannerUploader";
// ... 폼 내부, photos 업로더 아래:
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <BannerUploader equipmentId={equipmentId} slot="top"
    value={watch("quote_banner_top")} onChange={(p) => setValue("quote_banner_top", p)}
    onUploadingChange={setUploading} />
  <BannerUploader equipmentId={equipmentId} slot="bottom"
    value={watch("quote_banner_bottom")} onChange={(p) => setValue("quote_banner_bottom", p)}
    onUploadingChange={setUploading} />
</div>
```
> `watch`/`setValue`/`setUploading`은 EquipmentForm의 실제 RHF·상태 API에 맞춰라(폼이 이미 `useForm`·업로딩 가드를 갖고 있다 — 그 변수명 사용). 신규 장비(생성)에서 `equipmentId`가 미정이면 사진 업로더와 동일 방식으로 처리(기존 코드가 생성 시 임시 id를 어떻게 다루는지 따른다).

- [ ] **Step 5: 타입체크 + lint + 빌드**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: 모두 PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/equipment/schema.ts apps/web/src/app/admin/equipment/actions.ts apps/web/src/app/admin/equipment/_components/BannerUploader.tsx apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx
git commit -m "feat: 장비 화면 견적서 배너 업로드 2칸(상·하단)"
```

---

## Phase E — 검증 · 시각 튜닝

### Task 11: 게이트 + 실물 대조 튜닝

**Files:** (검증 + 템플릿 CSS 미세조정만)

- [ ] **Step 1: 전체 게이트**

Run(클린 DB):
```bash
supabase db reset && bash supabase/seed/seed-local.sh
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build
pnpm --filter worker typecheck && pnpm --filter worker test
pnpm --filter @jhtechsaas/db-tests test:rls
```
Expected: 전부 PASS. `as any` 0(신규 코드 grep 확인).
E2E: `bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e`(데모데이터 없는 클린에서).

- [ ] **Step 2: 실물 PDF 생성·육안 대조**

실제 자산(폰트·도장·장비 배너 2장)을 배치한 뒤, 로컬에서 워커를 1회 실행해 데모 견적을 발행→PDF 생성하고 `quote-pdfs`에서 받아 기준 PDF 2종과 대조:
```bash
# 데모 견적 발행(REST 또는 콘솔) → 워커 runOnce 1회 실행
SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> pnpm --filter worker exec tsx -e "import {createServiceClient} from '@jhtechsaas/shared'; import {runOnce} from './src/jobs/runner'; const s=createServiceClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY); await runOnce(s);"
```
생성 PDF를 Read 도구(이미지 안전)로 열어 헤더 배너·공급자박스·도장·품목표·합계·특기사항·하단 배너 정렬을 `Multicut…pdf`/`JU1810…pdf`와 비교. 어긋나는 간격·폰트·열폭을 `quote-html.ts`의 CSS로 조정(반복).

- [ ] **Step 3: 튜닝 커밋**

```bash
git add apps/worker/src/jobs/quote-html.ts
git commit -m "style: 견적서 PDF 양식 실물 대조 시각 튜닝"
```

---

## Self-Review

**1. Spec coverage:**
- 파이프라인 재사용·placeholder 교체 → Task 8 ✅
- Puppeteer 렌더 → Task 6·8 ✅
- equipment 배너 2컬럼 + profiles.phone 마이그레이션 → Task 4 ✅
- 공급자 상수(shared) → Task 2 ✅
- 견적→장비 매칭(shared 공유) → Task 3·9 ✅
- 관리자 배너 업로드 → Task 10 ✅
- 한글금액 유틸 → Task 1 ✅
- HTML 템플릿(배너·공급자·도장·수신·합계·품목표·specs·특기사항) → Task 7 ✅
- 장비사양 동적(specs) → Task 7·9 ✅
- 한글폰트·도장 base64 → Task 6·9 ✅
- db-test 신규 컬럼 → Task 5 ✅
- 게이트·실물 대조 → Task 11 ✅
- 비범위(커스텀 특기사항·메일·다중페이지) → 계획에 미포함(의도) ✅

**2. Placeholder scan:** 자산 파일(폰트·도장)·실물 튜닝은 "구현 입력/QA 단계"로 명시(placeholder 아님). db-test·EquipmentForm 배선은 "실제 헬퍼/RHF API에 맞추라"는 검증 지시 포함 — 코드 골격은 완전 제공.

**3. Type consistency:** `QuoteHtmlData`(Task 7) ↔ buildQuotePdf(Task 8) ↔ processQuotePdfJob(Task 9) 동일. `numberToKoreanAmount`(Task 1)·`matchEquipmentName`(Task 3)·`SUPPLIER`(Task 2) 정의 ↔ Task 9 사용 일치. 배너 경로 정규식(Task 4 CHECK ↔ Task 10 schema ↔ Task 9/BannerUploader)이 `banner-(top|bottom).{ext}`로 일관.
