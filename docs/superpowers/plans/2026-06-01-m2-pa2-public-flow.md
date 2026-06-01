# M2 P-A2 (#19b) — 공개 견적요청 흐름 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P-A1이 깐 데이터 위에 공개 고객 흐름을 올린다 — 홈 3분기 진입, 카탈로그 박스([상세][선택]), 장비 상세 재구성(highlights·아이콘 그룹사양·복수 영상), 대형 견적요청 폼(개인정보 동의·현장사진 업로드·설치설문·사업자번호 체크섬).

**Architecture:** Next.js App Router 공개 라우트. 서버 컴포넌트가 `equipment_public` 뷰·`privacy_policies` v1.0를 읽어 클라이언트 폼에 주입. 이미지는 **선택+미리보기 → 제출 시에만** anon 브라우저 클라이언트로 `customer-uploads/<제출uuid>/<slot>.ext`(버킷-상대) 업로드 → 경로를 RPC payload에 포함(고아 없음). biz_no는 `validateBizNo`(P-A1 shared)로 클라 zod refine + 서버 RPC 이중. 견적 RPC v2(P-A1)는 동의·사진·설문·장비를 이미 수용.

**Tech Stack:** Next 16(App Router, params=Promise), React 19, react-hook-form v5(3제네릭), zod 4, Tailwind 4, @supabase/ssr 브라우저 클라이언트, Playwright E2E.

**Spec:** GitHub #19 (P-A2 섹션). 설계: `docs/superpowers/specs/2026-06-01-m2-customer-portal-design.md` §2.1·2.2. 승인 목업: `~/workspace/e3-detail-mockup.html`. 디자인: `DESIGN.md`(industrial-clean, accent `#155E75`, Pretendard, 상태 색스파인, 숫자 mono).

**결정(이번 세션 확정):** 이미지 = 선택+미리보기→제출시 업로드(고아X) · 동의 = 인라인 아코디언 · P-A2 = 단일 PR. 파라미터 = `?equipment_id=`(기존 `?equipment=` reconcile).

**선행 확인(워커):** 로컬 Supabase 가동(`supabase status`). 게이트: `pnpm --filter web test`·`pnpm --filter @jhtechsaas/db-tests test:rls`·`pnpm --filter web typecheck`·`lint`·`build`·E2E `pnpm --filter web test:e2e`.

---

## File Structure

생성:
- `apps/web/src/app/equipment/[id]/_components/HighlightsList.tsx` (요약 불릿 렌더)
- `apps/web/src/app/request/_components/ConsentAccordion.tsx` (동의 체크 + 전문 아코디언)
- `apps/web/src/app/request/_components/SitePhotoUploader.tsx` (4슬롯 선택+미리보기)
- `apps/web/src/app/request/_components/InstallSurvey.tsx` (설치장소 설문 필드셋)
- `apps/web/src/lib/applications/upload.ts` (제출시 업로드 헬퍼 + 순수 경로 빌더)
- `apps/web/src/lib/applications/upload.test.ts`
- `apps/web/src/app/_components/HomeNav.tsx` (홈 3분기 카드)

수정:
- `apps/web/src/lib/applications/schema.ts` (+ `schema.test.ts`) — 동의·체크섬·설문·사진 슬롯
- `apps/web/src/app/page.tsx` — 3분기
- `apps/web/src/app/equipment/_components/EquipmentCard.tsx` — [상세][선택] 2버튼
- `apps/web/src/app/equipment/[id]/page.tsx` — 2열 재구성·highlights·복수 youtube·CTA 파라미터
- `apps/web/src/app/equipment/[id]/_components/SpecTable.tsx` — 그룹+아이콘(목업 정합, P-A1 최소판 확장)
- `apps/web/src/app/request/page.tsx` — `?equipment_id=`·privacy v1.0·장비명 주입
- `apps/web/src/app/request/_components/RequestForm.tsx` — 동의·업로드·설문 조립
- `apps/web/src/app/request/actions.ts` — 업로드 연계·payload 확장
- `e2e/request.spec.ts` — 대형 폼 흐름

---

## Task 1: 견적폼 스키마 확장 (동의·체크섬·설문)

**Files:**
- Modify: `apps/web/src/lib/applications/schema.ts`
- Test: `apps/web/src/lib/applications/schema.test.ts`

P-A1에서 `validateBizNo`(`@jhtechsaas/shared`)·RPC v2가 준비됨. 폼 스키마에 동의(필수 true)·biz_no 체크섬 refine·설치설문·사진 슬롯 키를 추가한다. 사진 파일 자체는 zod 밖(File 핸들링, 업로드 후 경로)이고 스키마는 **설문·동의·코어필드**만 검증.

- [ ] **Step 1: 실패 테스트** — `schema.test.ts`에 추가

```ts
import { describe, expect, test } from "vitest";
import { requestFormSchema, buildSubmitPayload } from "./schema";

const base = {
  company: "재현", ceo: "홍길동", biz_no: "1234567891", // P-A1 검증한 유효 체크섬
  phone: "02-1234-5678", email: "a@b.com", address: "서울",
  privacy_consent: true, requirements: "",
  building_type: "factory", location: "ground", elevator: "none",
  handling: [], power: "single_220", pneumatic: "none", survey_extra: "",
  equipment_id: "",
};

describe("requestFormSchema (P-A2)", () => {
  test("동의·체크섬·설문 충족 시 통과", () => {
    expect(requestFormSchema.safeParse(base).success).toBe(true);
  });
  test("동의 미체크는 실패", () => {
    expect(requestFormSchema.safeParse({ ...base, privacy_consent: false }).success).toBe(false);
  });
  test("biz_no 체크섬 불일치는 실패", () => {
    expect(requestFormSchema.safeParse({ ...base, biz_no: "1234567890" }).success).toBe(false);
  });
  test("기타사항 다중 체크(handling 배열) 허용", () => {
    const r = requestFormSchema.safeParse({ ...base, handling: ["no_vehicle", "manual"] });
    expect(r.success).toBe(true);
  });
});

describe("buildSubmitPayload (P-A2)", () => {
  test("fields.install_survey·photos·동의를 payload에 구성", () => {
    const input = requestFormSchema.parse({ ...base, handling: ["ladder"] });
    const payload = buildSubmitPayload(input, "XTRA 5000", { ext_entrance: "uuid1/ext_entrance.jpg" });
    expect(payload.privacy_consent).toBe(true);
    expect(payload.privacy_consent_version).toBe("v1.0");
    expect(payload.fields.install_survey.handling).toEqual(["ladder"]);
    expect(payload.fields.photos.ext_entrance).toBe("uuid1/ext_entrance.jpg");
    expect(payload.fields.equipment_name).toBe("XTRA 5000");
    expect(payload.biz_no).toBe("1234567891"); // 하이픈 제거 정규화
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test` → schema.test 실패

- [ ] **Step 3: 구현** — `schema.ts` 수정. 기존 코어 필드 유지 + 아래 추가/변경:

```ts
import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

const bizNoRegex = /^\d{10}$|^\d{3}-\d{2}-\d{5}$/;
const phoneRegex = /^(?=(?:[^0-9]*[0-9]){8,})[0-9+\-\s]{9,20}$/;

// 설치설문 enum(서버는 jsonb 자유저장 — 클라에서 UX·일관성 위해 enum 강제).
export const BUILDING_TYPES = ["factory", "store", "office", "etc"] as const;
export const LOCATIONS = ["basement", "ground", "upper"] as const;
export const ELEVATORS = ["have", "none"] as const;
export const HANDLING_OPTS = ["no_vehicle", "manual", "ladder"] as const; // 다중
export const POWERS = ["single_220", "triple_380"] as const;
export const PNEUMATICS = ["have", "none"] as const;

export const requestFormSchema = z.object({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  ceo: z.string().trim().min(1, "대표자명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  biz_no: z.string().trim().regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요")
    .refine(validateBizNo, "사업자등록번호 체크섬이 일치하지 않습니다"),
  phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다").max(200, "200자 이내로 입력하세요"),
  address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내로 입력하세요"),
  requirements: z.string().trim().max(2000, "2000자 이내로 입력하세요").optional().default(""),
  // 개인정보 동의 — 필수 true.
  privacy_consent: z.literal(true, { message: "개인정보 수집·이용 동의가 필요합니다" }),
  // 설치장소 설문.
  building_type: z.enum(BUILDING_TYPES),
  location: z.enum(LOCATIONS),
  elevator: z.enum(ELEVATORS),
  handling: z.array(z.enum(HANDLING_OPTS)).default([]),
  power: z.enum(POWERS),
  pneumatic: z.enum(PNEUMATICS),
  survey_extra: z.string().trim().max(1000, "1000자 이내로 입력하세요").optional().default(""),
  equipment_id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

export type RequestFormInput = z.infer<typeof requestFormSchema>;
export type RequestFormInputRaw = z.input<typeof requestFormSchema>;

// 슬롯 키(업로드·payload 공유).
export const PHOTO_SLOTS = ["ext_entrance", "ext_building", "int_entrance", "int_location"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export interface SubmitPayload {
  company: string; ceo: string; biz_no: string; phone: string; email: string; address: string;
  equipment_id?: string;
  privacy_consent: true;
  privacy_consent_version: string;
  fields: {
    requirements?: string;
    equipment_id?: string;
    equipment_name?: string;
    install_survey: {
      building_type: string; location: string; elevator: string;
      handling: string[]; power: string; pneumatic: string; extra?: string;
    };
    photos: Partial<Record<PhotoSlot, string>>;
  };
}

export const PRIVACY_VERSION = "v1.0";

// 폼 입력 + 업로드된 사진 경로 → RPC payload.
export function buildSubmitPayload(
  input: RequestFormInput,
  equipmentName: string | undefined,
  photos: Partial<Record<PhotoSlot, string>>,
): SubmitPayload {
  const fields: SubmitPayload["fields"] = {
    install_survey: {
      building_type: input.building_type, location: input.location, elevator: input.elevator,
      handling: input.handling, power: input.power, pneumatic: input.pneumatic,
      ...(input.survey_extra ? { extra: input.survey_extra } : {}),
    },
    photos,
  };
  if (input.requirements) fields.requirements = input.requirements;
  if (input.equipment_id) { fields.equipment_id = input.equipment_id; }
  if (equipmentName) fields.equipment_name = equipmentName;
  return {
    company: input.company, ceo: input.ceo,
    biz_no: input.biz_no.replace(/-/g, ""),
    phone: input.phone, email: input.email, address: input.address,
    ...(input.equipment_id ? { equipment_id: input.equipment_id } : {}),
    privacy_consent: true, privacy_consent_version: PRIVACY_VERSION,
    fields,
  };
}

export const seqNoSchema = z.string().regex(/^REQ-\d{8}-\d{5,}$/, "접수번호 형식 오류");
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter web test`

- [ ] **Step 5: 커밋**
```bash
git add apps/web/src/lib/applications/schema.ts apps/web/src/lib/applications/schema.test.ts
git commit -m "feat: 견적폼 스키마에 동의·biz_no 체크섬·설치설문·사진슬롯 추가"
```

---

## Task 2: 제출시 업로드 헬퍼 (순수 경로 빌더 + 업로드)

**Files:**
- Create: `apps/web/src/lib/applications/upload.ts`, `upload.test.ts`

- [ ] **Step 1: 실패 테스트** — `upload.test.ts` (순수 경로 빌더만 단위테스트, 실제 업로드는 통합/E2E)

```ts
import { describe, expect, test } from "vitest";
import { buildPhotoPath, PHOTO_SLOT_LABELS } from "./upload";

describe("buildPhotoPath", () => {
  test("버킷-상대 <uuid>/<slot>.<ext> 생성(확장자 소문자)", () => {
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "ext_entrance", "image/jpeg"))
      .toBe("11111111-1111-1111-1111-111111111111/ext_entrance.jpg");
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "int_location", "image/png"))
      .toBe("11111111-1111-1111-1111-111111111111/int_location.png");
  });
  test("허용 외 MIME는 null", () => {
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "ext_building", "image/gif")).toBeNull();
  });
  test("슬롯 라벨 4종 존재", () => {
    expect(Object.keys(PHOTO_SLOT_LABELS)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test`

- [ ] **Step 3: 구현** — `upload.ts`

```ts
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PhotoSlot } from "./schema";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 출입구", ext_building: "건물 외관",
  int_entrance: "내부 출입구", int_location: "설치 예정 장소",
};

// 버킷-상대 경로(<uuid>/<slot>.<ext>). 허용 MIME만, 그 외 null.
export function buildPhotoPath(submissionId: string, slot: PhotoSlot, mime: string): string | null {
  const ext = MIME_EXT[mime];
  return ext ? `${submissionId}/${slot}.${ext}` : null;
}

// 선택된 슬롯만 customer-uploads에 업로드. 경로 맵 반환. 실패 시 throw(폼이 안내).
export async function uploadSitePhotos(
  submissionId: string,
  files: Partial<Record<PhotoSlot, File>>,
): Promise<Partial<Record<PhotoSlot, string>>> {
  const supabase = createSupabaseBrowserClient();
  const out: Partial<Record<PhotoSlot, string>> = {};
  for (const [slot, file] of Object.entries(files) as [PhotoSlot, File][]) {
    if (!file) continue;
    const path = buildPhotoPath(submissionId, slot, file.type);
    if (!path) throw new Error("이미지는 JPG·PNG·WEBP만 업로드할 수 있습니다");
    const { error } = await supabase.storage
      .from("customer-uploads")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("사진 업로드에 실패했습니다");
    out[slot] = path;
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter web test`

- [ ] **Step 5: 커밋**
```bash
git add apps/web/src/lib/applications/upload.ts apps/web/src/lib/applications/upload.test.ts
git commit -m "feat: 현장사진 제출시 업로드 헬퍼(버킷-상대 경로·anon 브라우저)"
```

---

## Task 3: 홈 3분기 진입

**Files:**
- Create: `apps/web/src/app/_components/HomeNav.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: HomeNav 컴포넌트** — 3분기 카드(견적요청 active, A/S·소모품 "준비중" 비활성). DESIGN.md: industrial-clean, accent border, 비활성은 muted.

```tsx
import Link from "next/link";

const ITEMS = [
  { href: "/equipment", title: "견적 요청", desc: "장비를 둘러보고 온라인으로 견적을 요청하세요.", active: true },
  { href: "#", title: "A/S 신청", desc: "보유 장비의 수리·점검을 신청하세요.", active: false },
  { href: "#", title: "소모품 신청", desc: "장비별 소모품을 신청하세요.", active: false },
] as const;

// 홈 3분기 — 견적요청만 활성. A/S·소모품은 준비중(P-D/P-E).
export function HomeNav() {
  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
      {ITEMS.map((it) =>
        it.active ? (
          <Link
            key={it.title}
            href={it.href}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6 text-left transition-shadow hover:border-accent hover:shadow-md"
          >
            <span className="text-h2 font-semibold text-text">{it.title}</span>
            <span className="text-small text-muted">{it.desc}</span>
          </Link>
        ) : (
          <div
            key={it.title}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-6 text-left opacity-60"
            aria-disabled
          >
            <span className="text-h2 font-semibold text-muted">
              {it.title}
              <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-micro text-muted">준비중</span>
            </span>
            <span className="text-small text-muted">{it.desc}</span>
          </div>
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx 교체** — CatalogButton → HomeNav

```tsx
import { HomeNav } from "./_components/HomeNav";

// 공개 홈 — 3분기 진입(견적요청·A/S·소모품). 견적요청만 활성(M2 P-A).
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-display font-semibold text-text">(주)재현테크</h1>
        <p className="max-w-md text-body text-muted">포장·자동화 장비 견적·유지보수를 온라인으로.</p>
      </div>
      <HomeNav />
    </main>
  );
}
```

- [ ] **Step 3: 빌드 확인** — `pnpm --filter web build` (홈 정적 렌더). 기존 `_components/CatalogButton.tsx`가 다른 곳에서 안 쓰이면 그대로 둠(삭제는 별도, YAGNI).

- [ ] **Step 4: 커밋**
```bash
git add apps/web/src/app/_components/HomeNav.tsx apps/web/src/app/page.tsx
git commit -m "feat: 홈 3분기 진입(견적요청 활성·A/S·소모품 준비중)"
```

---

## Task 4: 카탈로그 박스 — [상세정보]·[장비선택] 2버튼

**Files:**
- Modify: `apps/web/src/app/equipment/_components/EquipmentCard.tsx`

현재 카드 전체가 상세 Link. → 사진+정보는 표시, 하단 2버튼: [상세정보]→`/equipment/[id]`, [장비선택]→`/request?equipment_id=[id]`.

- [ ] **Step 1: 교체**

```tsx
import Image from "next/image";
import Link from "next/link";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";

// 카탈로그 카드 — 사진·이름·모델·카테고리 + [상세정보][장비선택] 2버튼.
export function EquipmentCard({ item }: { item: EquipmentPublic }) {
  const cover = item.photos[0];
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg">
      <Link href={`/equipment/${item.id}`} className="relative aspect-[4/3] w-full bg-surface-2">
        {cover ? (
          <Image src={publicImageUrl(cover)} alt={item.name} fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-small text-muted">이미지 없음</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="text-h2 font-medium text-text">{item.name}</h2>
        {item.model && <span className="font-mono text-small text-muted">{item.model}</span>}
        {item.category && <span className="text-small text-muted">{item.category}</span>}
        <div className="mt-3 flex gap-2">
          <Link href={`/equipment/${item.id}`}
            className="flex-1 rounded-md border border-border px-3 py-2 text-center text-small font-medium text-text hover:border-accent">
            상세정보
          </Link>
          <Link href={`/request?equipment_id=${item.id}`}
            className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-small font-medium text-white hover:opacity-90">
            장비선택
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인** — `pnpm --filter web build`

- [ ] **Step 3: 커밋**
```bash
git add apps/web/src/app/equipment/_components/EquipmentCard.tsx
git commit -m "feat: 카탈로그 카드에 [상세정보]·[장비선택] 2버튼(equipment_id 프리필)"
```

---

## Task 5: 장비 상세 재구성 (2열·highlights·아이콘 그룹사양·복수 youtube)

**Files:**
- Create: `apps/web/src/app/equipment/[id]/_components/HighlightsList.tsx`
- Modify: `apps/web/src/app/equipment/[id]/_components/SpecTable.tsx`, `apps/web/src/app/equipment/[id]/page.tsx`

승인 목업(`~/workspace/e3-detail-mockup.html`) 정합: 상단 2열(좌 갤러리 / 우 제품명·모델·카테고리 + 요약 highlights + [장비선택] CTA), 중단 전폭 그룹사양(아이콘), 하단 전폭 youtube 그리드(0개 생략).

- [ ] **Step 1: HighlightsList** — 불릿(accent `›` 마커, 목업 정합)

```tsx
// 요약(highlights) 불릿 — accent 마커. 빈 배열이면 렌더 안 함.
export function HighlightsList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-h2 font-medium text-text">요약</span>
      <ul className="flex flex-col gap-2">
        {items.map((h, i) => (
          <li key={i} className="relative pl-5 text-body text-text">
            <span className="absolute left-0 font-bold text-accent">›</span>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: SpecTable 아이콘 그룹 렌더 확정** — P-A1에서 그룹형을 받지만 최소판. 그룹 헤더에 `SpecGroupIcon` + 그룹명, 그 아래 항목/값 표(목업 표 스타일). 그룹명 빈 그룹은 헤더 생략.

```tsx
import type { SpecGroup } from "@jhtechsaas/shared";
import { SpecGroupIcon } from "@/components/SpecGroupIcon";

// 사양 = 아이콘 그룹별 항목/값. 값은 mono. 빈 배열이면 안내.
export function SpecTable({ specs }: { specs: SpecGroup[] }) {
  if (specs.length === 0) return <p className="text-body text-muted">사양 정보 없음</p>;
  return (
    <div className="flex flex-col gap-8">
      {specs.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-3">
          {g.group && (
            <div className="flex items-center gap-2 text-text">
              <SpecGroupIcon icon={g.icon} className="h-5 w-5 text-accent" />
              <span className="text-h2 font-medium">{g.group}</span>
            </div>
          )}
          <table className="w-full border-collapse text-body">
            <tbody>
              {g.items.map((s, i) => (
                <tr key={i} className="border-b border-border">
                  <th className="w-1/3 py-2.5 pr-4 text-left font-medium text-muted">{s.label}</th>
                  <td className="py-2.5 font-mono text-text">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: page.tsx 재구성** — 상단 2열 + highlights + CTA(`?equipment_id=`) / 중단 전폭 사양 / 하단 전폭 복수 youtube. 기존 PublicGallery·YoutubeEmbed 재사용.

```tsx
// (생략: import 들 — getPublicEquipment, buildEquipmentMetadata, PublicGallery, SpecTable, YoutubeEmbed, HighlightsList, z, notFound, Link, Metadata, siteUrl, getPublicEnv. generateMetadata는 기존 유지.)

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const eq = await getPublicEquipment(id);
  if (!eq) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link href="/equipment" className="mb-6 inline-block text-small text-muted hover:text-text">← 카탈로그로</Link>

      {/* 상단 2열 */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <PublicGallery photos={eq.photos} name={eq.name} />
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h1 className="text-display font-semibold text-text">{eq.name}</h1>
            {eq.model && <span className="font-mono text-body text-muted">{eq.model}</span>}
            {eq.category && <span className="text-small text-muted">{eq.category}</span>}
          </header>
          <HighlightsList items={eq.highlights} />
          <Link href={`/request?equipment_id=${eq.id}`}
            className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-accent px-6 py-3 text-body font-medium text-white hover:opacity-90">
            이 장비로 견적 요청
          </Link>
        </div>
      </div>

      {/* 중단 전폭: 사양 */}
      <section className="mt-12 flex flex-col gap-4">
        <h2 className="text-h2 font-medium text-text">제품 사양</h2>
        <SpecTable specs={eq.specs} />
      </section>

      {/* 하단 전폭: 복수 영상(0개 생략) */}
      {eq.youtube_urls.length > 0 && (
        <section className="mt-12 flex flex-col gap-4">
          <h2 className="text-h2 font-medium text-text">제품 영상</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {eq.youtube_urls.map((url, i) => (<YoutubeEmbed key={i} url={url} />))}
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 4: 빌드·타입 확인** — `pnpm --filter web typecheck && pnpm --filter web build`

- [ ] **Step 5: 커밋**
```bash
git add apps/web/src/app/equipment/[id]/
git commit -m "feat: 장비 상세 재구성(2열·highlights·아이콘 그룹사양·복수 youtube)"
```

---

## Task 6: 동의 아코디언 컴포넌트

**Files:**
- Create: `apps/web/src/app/request/_components/ConsentAccordion.tsx`

react-hook-form `register("privacy_consent")` 연결. 전문은 서버에서 받은 v1.0 body를 prop으로.

- [ ] **Step 1: 구현**

```tsx
"use client";
import { useState } from "react";
import type { UseFormRegister, FieldError } from "react-hook-form";
import type { RequestFormInputRaw } from "@/lib/applications/schema";

// 개인정보 동의 — 필수 체크박스 + 전문 인라인 아코디언.
export function ConsentAccordion({
  register, error, policyBody,
}: {
  register: UseFormRegister<RequestFormInputRaw>;
  error?: FieldError;
  policyBody: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <label className="flex items-start gap-2 text-body text-text">
        <input type="checkbox" {...register("privacy_consent")} className="mt-1" />
        <span>개인정보 수집·이용에 동의합니다 <span className="text-danger">(필수)</span></span>
      </label>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="self-start text-small text-accent hover:underline">
        {open ? "▾ 전문 닫기" : "▸ 전문 보기"}
      </button>
      {open && (
        <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 text-small text-muted">
          {policyBody}
        </div>
      )}
      {error && <p className="text-small text-danger">{error.message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 타입 확인** — `pnpm --filter web typecheck` (이 파일은 RequestForm 배선 후 완전 검증 — Task 8)

- [ ] **Step 3: 커밋**
```bash
git add apps/web/src/app/request/_components/ConsentAccordion.tsx
git commit -m "feat: 개인정보 동의 인라인 아코디언 컴포넌트"
```

---

## Task 7: 현장사진 업로더 + 설치설문 컴포넌트

**Files:**
- Create: `apps/web/src/app/request/_components/SitePhotoUploader.tsx`, `InstallSurvey.tsx`

- [ ] **Step 1: SitePhotoUploader** — 4슬롯 file input + objectURL 미리보기. 선택 File을 부모에 콜백(업로드는 제출 시 Task 8). 외부전경(ext_entrance·ext_building)·내부전경(int_entrance·int_location) 2그룹.

```tsx
"use client";
import { useEffect, useState } from "react";
import { PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { PHOTO_SLOT_LABELS } from "@/lib/applications/upload";

const GROUPS: { title: string; slots: PhotoSlot[] }[] = [
  { title: "외부 전경(선택)", slots: ["ext_entrance", "ext_building"] },
  { title: "내부 전경(선택)", slots: ["int_entrance", "int_location"] },
];

export function SitePhotoUploader({
  onChange,
}: {
  onChange: (files: Partial<Record<PhotoSlot, File>>) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});

  // objectURL 누수 방지.
  useEffect(() => () => { Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)); }, [previews]);

  function pick(slot: PhotoSlot, file?: File) {
    const next = { ...files };
    const nextPrev = { ...previews };
    if (nextPrev[slot]) URL.revokeObjectURL(nextPrev[slot]!);
    if (file) { next[slot] = file; nextPrev[slot] = URL.createObjectURL(file); }
    else { delete next[slot]; delete nextPrev[slot]; }
    setFiles(next); setPreviews(nextPrev); onChange(next);
  }

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="flex flex-col gap-3">
          <legend className="text-small font-medium text-muted">{g.title}</legend>
          <div className="grid grid-cols-2 gap-3">
            {g.slots.map((slot) => (
              <label key={slot} className="flex flex-col gap-1 text-small text-muted">
                {PHOTO_SLOT_LABELS[slot]}
                <input type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => pick(slot, e.target.files?.[0])}
                  className="text-small" />
                {previews[slot] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[slot]} alt={PHOTO_SLOT_LABELS[slot]} className="mt-1 aspect-[4/3] w-full rounded-sm object-cover" />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: InstallSurvey** — 설문 필드셋(register 연결). enum 라벨 한국어.

```tsx
"use client";
import type { UseFormRegister } from "react-hook-form";
import type { RequestFormInputRaw } from "@/lib/applications/schema";

const SEL = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

export function InstallSurvey({ register }: { register: UseFormRegister<RequestFormInputRaw> }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-h2 font-medium text-text">설치 장소 정보</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-small text-muted">건물 유형
          <select {...register("building_type")} className={SEL}>
            <option value="factory">공장</option><option value="store">상가</option>
            <option value="office">사무실</option><option value="etc">기타</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">설치 위치
          <select {...register("location")} className={SEL}>
            <option value="basement">지하</option><option value="ground">1층</option>
            <option value="upper">2층 이상</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">엘리베이터
          <select {...register("elevator")} className={SEL}>
            <option value="have">있음</option><option value="none">없음</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">전력
          <select {...register("power")} className={SEL}>
            <option value="single_220">단상 220V</option><option value="triple_380">3상 380V</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">공압
          <select {...register("pneumatic")} className={SEL}>
            <option value="have">있음</option><option value="none">없음</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-small text-muted">기타사항(해당 시 체크)</span>
        <div className="flex flex-wrap gap-4 text-body text-text">
          <label className="flex items-center gap-2"><input type="checkbox" value="no_vehicle" {...register("handling")} />차량 진입 곤란</label>
          <label className="flex items-center gap-2"><input type="checkbox" value="manual" {...register("handling")} />수작업 운반</label>
          <label className="flex items-center gap-2"><input type="checkbox" value="ladder" {...register("handling")} />사다리차 필요</label>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-small text-muted">기타 요청사항
        <textarea {...register("survey_extra")} rows={2} className={SEL} />
      </label>
    </fieldset>
  );
}
```

- [ ] **Step 3: 커밋**
```bash
git add apps/web/src/app/request/_components/SitePhotoUploader.tsx apps/web/src/app/request/_components/InstallSurvey.tsx
git commit -m "feat: 현장사진 업로더(4슬롯 미리보기)+설치설문 필드셋 컴포넌트"
```

---

## Task 8: 대형 견적폼 조립 + 서버액션 업로드 연계

**Files:**
- Modify: `apps/web/src/app/request/_components/RequestForm.tsx`, `apps/web/src/app/request/actions.ts`

- [ ] **Step 1: RequestForm 재조립** — 동의(상단)·코어필드·biz_no·설문·사진·제출. 제출 흐름: 폼 검증 통과 → `crypto.randomUUID()` 제출ID → `uploadSitePhotos` → `buildSubmitPayload(values, equipmentName, photos)` → `submitRequest(payload)`.

```tsx
"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestFormSchema, buildSubmitPayload,
  type RequestFormInput, type RequestFormInputRaw, type PhotoSlot,
} from "@/lib/applications/schema";
import { uploadSitePhotos } from "@/lib/applications/upload";
import { submitRequest } from "../actions";
import { ConsentAccordion } from "./ConsentAccordion";
import { SitePhotoUploader } from "./SitePhotoUploader";
import { InstallSurvey } from "./InstallSurvey";

const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

export function RequestForm({
  equipmentId, equipmentName, policyBody,
}: { equipmentId?: string; equipmentName?: string; policyBody: string }) {
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<RequestFormInputRaw, unknown, RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: { equipment_id: equipmentId ?? "", requirements: "", handling: [], survey_extra: "",
      building_type: "factory", location: "ground", elevator: "none", power: "single_220", pneumatic: "none" },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<PhotoSlot, File>>>({});

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const submissionId = crypto.randomUUID();
      const photos = await uploadSitePhotos(submissionId, photoFiles); // 제출 시에만 업로드(고아X)
      const payload = buildSubmitPayload(values, equipmentName, photos);
      const res = await submitRequest(payload);
      if (res?.error) setServerError(res.error);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "제출에 실패했습니다");
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <ConsentAccordion register={register} error={errors.privacy_consent} policyBody={policyBody} />
      {equipmentName && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-small text-muted">
          선택 장비: <span className="font-mono text-text">{equipmentName}</span>
        </div>
      )}
      <input type="hidden" {...register("equipment_id")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 회사·대표·biz_no·연락처·이메일·주소 — 기존 6필드(라벨/에러 동일 패턴) */}
        {/* ... 회사명 */}
        <Field label="회사명" error={errors.company?.message}><input {...register("company")} className={FIELD} /></Field>
        <Field label="대표자명" error={errors.ceo?.message}><input {...register("ceo")} className={FIELD} /></Field>
        <Field label="사업자등록번호" error={errors.biz_no?.message}><input {...register("biz_no")} inputMode="numeric" placeholder="123-45-67890" className={`${FIELD} font-mono`} /></Field>
        <Field label="연락처" error={errors.phone?.message}><input {...register("phone")} inputMode="tel" placeholder="02-1234-5678" className={`${FIELD} font-mono`} /></Field>
        <Field label="이메일" error={errors.email?.message}><input {...register("email")} type="email" className={FIELD} /></Field>
        <Field label="주소" error={errors.address?.message}><input {...register("address")} className={FIELD} /></Field>
      </div>

      <Field label="요청사항" error={errors.requirements?.message}>
        <textarea {...register("requirements")} rows={4} placeholder="장비 사양·예산·납기 등" className={FIELD} />
      </Field>

      <SitePhotoUploader onChange={setPhotoFiles} />
      <InstallSurvey register={register} />

      {serverError && <p className="text-small text-danger">{serverError}</p>}
      <button type="submit" disabled={isSubmitting}
        className="rounded-md bg-accent px-6 py-3 text-body font-medium text-white disabled:opacity-60">
        {isSubmitting ? "제출 중…" : "견적 요청 보내기"}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-small text-muted">{label}{children}</label>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: actions.ts `submitRequest`** — 이제 폼이 만든 payload를 받는다(업로드는 클라). 서버는 payload를 RPC로 전달(서버 재검증은 RPC v2가 수행). 시그니처를 `submitRequest(payload: SubmitPayload)`로. equipment_name은 클라가 넣지만 서버가 신뢰 안 함(RPC는 equipment_id로 검증). 기존 redirect·seqNo 검증 유지.

```ts
"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seqNoSchema, type SubmitPayload } from "@/lib/applications/schema";

export async function submitRequest(payload: SubmitPayload): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_application", { payload });
  if (error) {
    console.error("[request.submit] rpc 실패", error);
    return { error: "견적 요청 저장에 실패했습니다. 입력값을 확인해주세요." };
  }
  const seq = seqNoSchema.safeParse(data);
  if (!seq.success) {
    console.error("[request.submit] seq_no 형식 오류", data);
    return { error: "접수번호 생성에 실패했습니다." };
  }
  redirect(`/request/success?no=${encodeURIComponent(seq.data)}`);
}
```

> 주: 기존 `submitRequest(values)` → `submitRequest(payload)`로 시그니처 변경. 서버 재검증을 RPC에 위임(RPC v2가 동의·체크섬·경로·장비를 전부 강제하므로 안전). equipment_name 조회 로직 제거(클라가 표시용으로 전달, 저장은 RPC가 equipment_id로).

- [ ] **Step 3: 게이트** — `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`

- [ ] **Step 4: 커밋**
```bash
git add apps/web/src/app/request/_components/RequestForm.tsx apps/web/src/app/request/actions.ts
git commit -m "feat: 대형 견적폼 조립(동의·업로드·설문) + 서버액션 RPC 연계"
```

---

## Task 9: request 페이지 — 파라미터·동의문구·장비명 주입

**Files:**
- Modify: `apps/web/src/app/request/page.tsx`

- [ ] **Step 1: 수정** — `?equipment_id=` 읽기(기존 `?equipment=` reconcile), `privacy_policies` v1.0 body + 장비명 서버 조회 후 RequestForm에 주입.

```tsx
import { z } from "zod";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestForm } from "./_components/RequestForm";
import { PRIVACY_VERSION } from "@/lib/applications/schema";

export default async function RequestPage({
  searchParams,
}: { searchParams: Promise<{ equipment_id?: string }> }) {
  const { equipment_id } = await searchParams;
  const validId = equipment_id && z.string().uuid().safeParse(equipment_id).success ? equipment_id : undefined;

  let equipmentName: string | undefined;
  if (validId) {
    const eq = await getPublicEquipment(validId);
    equipmentName = eq?.name; // inactive·없음이면 이름 없음(폼은 정상)
  }

  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from("privacy_policies").select("body").eq("version", PRIVACY_VERSION).maybeSingle();
  const policyBody = policy?.body ?? "개인정보 처리방침 전문을 불러오지 못했습니다.";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">견적 요청</h1>
      <p className="mt-2 text-body text-muted">정보를 입력하시면 담당자가 검토 후 연락드립니다.</p>
      <RequestForm equipmentId={validId} equipmentName={equipmentName} policyBody={policyBody} />
    </main>
  );
}
```

- [ ] **Step 2: 게이트** — `pnpm --filter web typecheck && pnpm --filter web build`

- [ ] **Step 3: 커밋**
```bash
git add apps/web/src/app/request/page.tsx
git commit -m "feat: 견적 페이지 equipment_id 파라미터·동의문구·장비명 주입"
```

---

## Task 10: E2E + 전체 게이트

**Files:**
- Modify: `e2e/request.spec.ts`

- [ ] **Step 1: E2E 갱신** — 홈→카탈로그→[장비선택]→폼(동의 체크 + 코어필드 + 설문)→제출→접수번호. 사진 업로드는 E2E에서 선택(파일 픽 생략 가능 — 선택이므로). 동의 미체크 시 제출 차단도 단언.

```ts
import { test, expect } from "@playwright/test";
// 기존 request.spec.ts 패턴 따름(service_role 시드 active 장비, afterAll 정리).
// 핵심 시나리오:
//  1) /equipment → 카드 [장비선택] 클릭 → /request?equipment_id=... 진입(선택장비 칩)
//  2) 동의 미체크로 제출 → 인라인 에러 "동의가 필요" / 미이동
//  3) 동의 체크 + 코어 6필드(유효 biz_no 1234567891) + 설문 기본값 → 제출 → /request/success?no=REQ-
//  4) DB: applications에 privacy_consent=true·equipment_id·fields.install_survey 저장(service_role 확인)
```
(기존 파일의 시드/정리 헬퍼 재사용, 위 4시나리오를 실제 셀렉터로 작성. 유효 biz_no는 `1234567891`.)

- [ ] **Step 2: 전체 게이트 GREEN**
```bash
pnpm --filter @jhtechsaas/shared test
pnpm --filter web test
pnpm --filter @jhtechsaas/db-tests test:rls
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build
pnpm --filter web test:e2e
grep -rn "as any" apps/web/src packages/shared/src | grep -v "\.test\." || echo "as any 0"
```
전부 PASS, `as any` 0.

- [ ] **Step 3: 커밋**
```bash
git add e2e/request.spec.ts
git commit -m "test: 대형 견적폼 E2E(장비선택→동의→설문→제출→접수번호)"
```

---

## Self-Review 체크 결과

- **Spec coverage(#19 P-A2 AC 1~9):** AC1 홈3분기(T3)·AC2 카탈로그2버튼(T4)·AC3 상세2열/아이콘/youtube(T5)·AC4 동의(T6,T8)·AC5 사진업로드(T2,T7,T8)·AC6 설문(T7,T8)·AC7 biz_no체크섬(T1)·AC8 제출→접수번호(T8,T9,T10)·AC9 게이트(T10). ✅
- **Placeholder scan:** RequestForm Step1의 6필드를 `Field` 헬퍼로 실제 작성(축약 아님). E2E Task10은 시나리오 명세 + 기존 패턴 재사용 지시(실셀렉터는 구현자가 기존 spec 참조) — 유일한 비완전 코드이나 기존 파일 컨벤션이 명확. ✅
- **Type consistency:** `PhotoSlot`/`PHOTO_SLOTS`(schema) ↔ `PHOTO_SLOT_LABELS`/`buildPhotoPath`(upload) ↔ RPC 경로 정규식(P-A1) ↔ 버킷 정책(P-A1) 모두 버킷-상대 `<uuid>/<slot>.ext` 일치. `SubmitPayload`(schema) ↔ submitRequest 인자 ↔ RPC v2 수용 필드 일치. `RequestFormInputRaw` 제네릭 일관. ✅

## 주의(실행 시)
- **시그니처 변경**: `submitRequest(values)`→`submitRequest(payload)`. 기존 호출처는 RequestForm뿐(Task8서 동시 변경) → 깨짐 없음.
- **anon 업로드 정책**: P-A1에서 customer-uploads INSERT 정책이 `name ~ <uuid>/<slot>` 강제 → `buildPhotoPath`가 정확히 그 형식 생성해야 통과(uuid는 `crypto.randomUUID()` 소문자, slot 화이트리스트, ext 소문자). 불일치 시 403.
- **biz_no 유효 예시**: 테스트·E2E 모두 `1234567891`(P-A1서 알고리즘 검증). `1234567890`은 무효.
- **objectURL 누수**: SitePhotoUploader cleanup(useEffect revoke) 필수.
- **CatalogButton**: 홈에서 제거되나 파일 삭제는 안 함(다른 참조 없으면 후속 정리, YAGNI). lint unused 경고 시에만 처리.
