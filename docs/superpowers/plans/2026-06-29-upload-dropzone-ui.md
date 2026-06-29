# 사진/파일 첨부 UI 통일(드롭존 카드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저 기본 파일선택 버튼으로 흩어진 사진/파일 첨부 4곳을, 장비 카탈로그 이미지처럼 "한눈에 보이는 점선 드롭존 카드"로 통일한다.

**Architecture:** 순수 UI 셸 컴포넌트 `FileDropCard`(업로드 로직 없음)를 1개 신설하고, 4개 업로더(`SitePhotoUploader`·`AsPhotoUploader`·`BannerUploader`·`CatalogUploader`)의 안쪽 `input`/버튼 마크업만 이 컴포넌트로 교체한다. 각 업로더의 기존 업로드 로직·시점·Storage 경로·검증은 손대지 않는다.

**Tech Stack:** Next.js(App Router) · React 19 · Tailwind(DESIGN.md 토큰) · Supabase Storage(브라우저 클라, 기존 그대로) · Playwright(e2e) · Vitest(node env)

## Global Constraints

- DB·마이그레이션·RPC·서버액션·Storage 버킷/정책 **무변경**. 변경은 `apps/web` UI 한정. `db push` 불필요.
- DESIGN.md 토큰만 사용(새 색 0): 드롭존 = `border-dashed border-border bg-surface-2`, 카드 radius, `text-small`/`text-micro`/`text-muted`/`text-text`/`text-danger`. 드래그오버 강조는 `border-accent`(+ 가능하면 `bg-accent-soft`, 토큰 없으면 생략).
- 슬롯(견적 4·AS 3)은 유지 — 각 슬롯 = 카드 1개, 슬롯명은 카드 캡션으로 항상 표시.
- AS 증상사진은 모바일 카메라 직행(`capture="environment"`) 유지.
- 검증 헬퍼(`validateImageFile`, `IMAGE_ACCEPT`, `PHOTO_SLOT_LABELS`, `AS_PHOTO_SLOT_LABELS`, `publicImageUrl`) 재사용.
- 코드 주석은 한국어. `as any` 0.
- web 단위테스트는 `environment: "node"` — 컴포넌트 렌더 자동 테스트 인프라 없음. UI 검증은 **시각 검증(browse 스크린샷 → Read 대조) + 기존 게이트 회귀 + equipment e2e 보강**으로 한다.

---

### Task 1: `FileDropCard` 공통 컴포넌트 신설

**Files:**
- Create: `apps/web/src/components/ui/FileDropCard.tsx`

**Interfaces:**
- Produces:
  ```ts
  type FileDropPreview =
    | { kind: "image"; url: string }
    | { kind: "file"; name: string }
    | null;
  type FileDropCardProps = {
    label: string;
    accept: string;
    capture?: "environment";
    preview: FileDropPreview;
    onPick: (file: File) => void;
    onClear?: () => void;
    busy?: boolean;
    disabled?: boolean;
    hint?: string;
    icon?: React.ReactNode;
  };
  export function FileDropCard(props: FileDropCardProps): JSX.Element;
  ```

- [ ] **Step 1: 컴포넌트 작성**

`apps/web/src/components/ui/FileDropCard.tsx`:

```tsx
"use client";
import { useRef, useState, type ReactNode } from "react";

// 사진/파일 첨부 공통 UI 셸 — 점선 드롭존 카드. 업로드·검증 로직은 부모가 담당하고,
// 이 컴포넌트는 "고르기 UX"(클릭·드래그앤드롭·미리보기·삭제)만 책임진다.
export type FileDropPreview =
  | { kind: "image"; url: string }
  | { kind: "file"; name: string }
  | null;

export type FileDropCardProps = {
  label: string; // 슬롯/필드 이름(카드 캡션·접근명)
  accept: string; // input accept (이미지 MIME 또는 application/pdf)
  capture?: "environment"; // 모바일 카메라 직행(AS 증상사진)
  preview: FileDropPreview; // null=빈 상태
  onPick: (file: File) => void; // 파일 선택/드롭 시(부모가 검증·업로드)
  onClear?: () => void; // 있으면 삭제 버튼 표시
  busy?: boolean; // 업로드 중(입력 차단)
  disabled?: boolean;
  hint?: string; // 형식/크기 안내
  icon?: ReactNode; // 빈 상태 아이콘(기본 📷)
};

export function FileDropCard({
  label,
  accept,
  capture,
  preview,
  onPick,
  onClear,
  busy = false,
  disabled = false,
  hint,
  icon,
}: FileDropCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const interactive = !busy && !disabled;

  function trigger() {
    if (interactive) inputRef.current?.click();
  }
  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) onPick(f);
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일 재선택 허용
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-small font-medium text-muted">{label}</span>
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        aria-label={`${label} 첨부`}
        onClick={trigger}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            trigger();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (interactive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (interactive) handleFiles(e.dataTransfer.files);
        }}
        className={`relative flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-dashed p-3 text-center transition ${
          dragOver ? "border-accent bg-surface-2" : "border-border bg-surface-2"
        } ${interactive ? "cursor-pointer" : "pointer-events-none opacity-60"}`}
      >
        {preview?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={label} className="absolute inset-0 h-full w-full object-cover" />
        ) : preview?.kind === "file" ? (
          <>
            <span className="text-2xl" aria-hidden>📄</span>
            <span className="max-w-full truncate text-small text-text">{preview.name}</span>
            <span className="text-micro text-muted">다시 클릭해 교체</span>
          </>
        ) : (
          <>
            <span className="text-2xl" aria-hidden>{icon ?? "📷"}</span>
            <span className="text-micro text-muted">클릭 · 끌어다 놓기</span>
            {hint ? <span className="text-micro text-muted">{hint}</span> : null}
          </>
        )}

        {preview && onClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label={`${label} 삭제`}
            className="absolute right-1 top-1 z-10 rounded-full bg-surface/90 px-1.5 py-0.5 text-small text-danger shadow-sm"
          >
            ✕
          </button>
        ) : null}

        {busy ? (
          <span className="absolute inset-x-0 bottom-1 text-micro text-muted">업로드 중…</span>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          capture={capture}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter web typecheck`
Expected: 통과(에러 0). `bg-accent-soft` 같은 미존재 토큰 안 씀.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/ui/FileDropCard.tsx
git commit -m "feat: 사진/파일 첨부 공통 드롭존 카드 FileDropCard 신설"
```

---

### Task 2: `BannerUploader`(견적서 로고/이미지) 적용

**Files:**
- Modify: `apps/web/src/app/admin/equipment/_components/BannerUploader.tsx`

**Interfaces:**
- Consumes: `FileDropCard`, `FileDropPreview` (Task 1)
- Produces: Props(`equipmentId`/`slot`/`value`/`onChange`/`onUploadingChange`) **변경 없음** — 부모(EquipmentForm) 무수정.

**배경:** 즉시 업로드(upsert)형. 기존 `handle(file)`·검증·Storage 경로 그대로 두고, return JSX의 raw input·미리보기를 `FileDropCard`로 교체. `busy` 표시를 위해 로컬 state 추가.

- [ ] **Step 1: return/상태 교체**

`BannerUploader.tsx` — import에 `FileDropCard` 추가, `busy` state 추가, `handle`에서 `busy` 토글, return 교체:

```tsx
"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { validateImageFile, publicImageUrl } from "@/lib/equipment/images";
import { FileDropCard } from "@/components/ui/FileDropCard";

const ALLOWED_BANNER_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

type Props = {
  equipmentId: string;
  slot: "name" | "image";
  value: string;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void;
};

export function BannerUploader({ equipmentId, slot, value, onChange, onUploadingChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = slot === "name" ? "장비 네임 로고 (견적서 좌하단)" : "장비 이미지 (견적서 우하단)";

  async function handle(file: File) {
    const check = validateImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    if (!ALLOWED_BANNER_EXT.has(ext)) {
      setError(`${file.name}: 지원하지 않는 형식`);
      return;
    }
    setError(null);
    setBusy(true);
    onUploadingChange(true);
    try {
      const path = `equipment/${equipmentId}/device-${slot}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from("equipment-images")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      onChange(path);
    } finally {
      setBusy(false);
      onUploadingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <FileDropCard
        label={label}
        accept="image/*"
        preview={value ? { kind: "image", url: publicImageUrl(value) } : null}
        onPick={handle}
        onClear={() => onChange("")}
        busy={busy}
        hint="jpg · png · webp"
      />
      {error && <span className="text-small text-danger">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 시각 검증**

Run: `pnpm --filter web typecheck`
Expected: 통과.

시각 검증(구현자 수행): 장비 편집 화면에서 견적서 로고/이미지 칸이 점선 드롭존 카드로 보이고, 업로드 후 썸네일 + ✕ 가 뜨는지 확인(browse 스크린샷 → Read 대조). 기존 ImageUploader(이미지 섹션)와 톤 일치 확인.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/equipment/_components/BannerUploader.tsx
git commit -m "feat: 견적서 로고/이미지 첨부를 드롭존 카드로"
```

---

### Task 3: `CatalogUploader`(제품 카탈로그 PDF) 적용

**Files:**
- Modify: `apps/web/src/app/admin/equipment/_components/CatalogUploader.tsx`

**Interfaces:**
- Consumes: `FileDropCard` (Task 1)
- Produces: Props 변경 없음.

**배경:** PDF 단일·즉시 업로드. preview는 `{ kind: "file", name: "catalog.pdf" }`. 아이콘 📄.

- [ ] **Step 1: return 교체**

`CatalogUploader.tsx` — `inputRef` 제거, `FileDropCard` 사용:

```tsx
"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FileDropCard } from "@/components/ui/FileDropCard";

const MAX = 20 * 1024 * 1024;

type Props = {
  equipmentId: string;
  value: string;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void;
};

export function CatalogUploader({ equipmentId, value, onChange, onUploadingChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("PDF 파일만 업로드할 수 있습니다");
      return;
    }
    if (file.size > MAX) {
      setError("20MB 이하만 업로드할 수 있습니다");
      return;
    }
    setBusy(true);
    onUploadingChange(true);
    try {
      const path = `equipment/${equipmentId}/catalog.pdf`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from("equipment-catalogs")
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        setError(`업로드 실패: ${upErr.message}`);
        return;
      }
      onChange(path);
    } finally {
      setBusy(false);
      onUploadingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <FileDropCard
        label="제품 카탈로그 (PDF)"
        accept="application/pdf"
        icon="📄"
        preview={value ? { kind: "file", name: "catalog.pdf" } : null}
        onPick={handle}
        onClear={() => onChange("")}
        busy={busy}
        hint="PDF · 최대 20MB · 견적 메일에 첨부"
      />
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 시각 검증**

Run: `pnpm --filter web typecheck`
시각: 카탈로그 칸이 📄 드롭존 카드로 보이고, 업로드 후 "catalog.pdf" + ✕ 표시.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/admin/equipment/_components/CatalogUploader.tsx
git commit -m "feat: 제품 카탈로그(PDF) 첨부를 드롭존 카드로"
```

---

### Task 4: `SitePhotoUploader`(견적 현장사진 4슬롯) 적용

**Files:**
- Modify: `apps/web/src/app/(portal)/request/_components/SitePhotoUploader.tsx`

**Interfaces:**
- Consumes: `FileDropCard` (Task 1)
- Produces: `onChange(files: Partial<Record<PhotoSlot, File>>)` 콜백 시그니처 **변경 없음** — 부모(RequestForm) 무수정.

**배경:** 제출 시 업로드형(로컬 objectURL 미리보기). 슬롯별 `<label><input></label>`을 `FileDropCard`로 교체. 그룹(외부/내부) 구조 유지. `pick(slot, file)`로 선택, `pick(slot, undefined)`로 삭제.

- [ ] **Step 1: return 교체**

`SitePhotoUploader.tsx` — import에 `FileDropCard` 추가, GROUPS 유지, 슬롯 렌더를 교체:

```tsx
"use client";
import { useEffect, useState } from "react";
import { type PhotoSlot } from "@/lib/applications/schema";
import { PHOTO_SLOT_LABELS } from "@/lib/applications/upload";
import { FileDropCard } from "@/components/ui/FileDropCard";

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

  useEffect(
    () => () => {
      Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u));
    },
    [previews],
  );

  function pick(slot: PhotoSlot, file?: File) {
    const next = { ...files };
    const nextPrev = { ...previews };
    if (nextPrev[slot]) URL.revokeObjectURL(nextPrev[slot]!);
    if (file) {
      next[slot] = file;
      nextPrev[slot] = URL.createObjectURL(file);
    } else {
      delete next[slot];
      delete nextPrev[slot];
    }
    setFiles(next);
    setPreviews(nextPrev);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="flex flex-col gap-3">
          <legend className="text-small font-medium text-muted">{g.title}</legend>
          <div className="grid grid-cols-2 gap-3">
            {g.slots.map((slot) => {
              const url = previews[slot];
              return (
                <FileDropCard
                  key={slot}
                  label={PHOTO_SLOT_LABELS[slot]}
                  accept="image/jpeg,image/png,image/webp"
                  preview={url ? { kind: "image", url } : null}
                  onPick={(f) => pick(slot, f)}
                  onClear={() => pick(slot, undefined)}
                  hint="jpg · png · webp"
                />
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 시각 검증**

Run: `pnpm --filter web typecheck`
시각: 견적신청 폼(`/request`)에서 현장사진 4칸이 슬롯명(외부진입로/건물외관/내부입구/설치위치) 캡션 + 드롭존 카드로 보이고, 선택 시 그 칸에 썸네일 + ✕.

- [ ] **Step 3: 커밋**

```bash
git add "apps/web/src/app/(portal)/request/_components/SitePhotoUploader.tsx"
git commit -m "feat: 견적 현장사진 4슬롯을 드롭존 카드로"
```

---

### Task 5: `AsPhotoUploader`(AS 증상사진 3슬롯) 적용

**Files:**
- Modify: `apps/web/src/app/(portal)/support/_components/AsPhotoUploader.tsx`

**Interfaces:**
- Consumes: `FileDropCard` (Task 1)
- Produces: `onChange(files: Partial<Record<AsPhotoSlot, File>>)` 콜백 **변경 없음**.

**배경:** Task 4와 동형 + `capture="environment"`(모바일 카메라) 유지.

- [ ] **Step 1: return 교체**

`AsPhotoUploader.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { AS_PHOTO_SLOTS, type AsPhotoSlot } from "@/lib/service-requests/schema";
import { AS_PHOTO_SLOT_LABELS } from "@/lib/service-requests/upload";
import { FileDropCard } from "@/components/ui/FileDropCard";

export function AsPhotoUploader({
  onChange,
}: {
  onChange: (files: Partial<Record<AsPhotoSlot, File>>) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<AsPhotoSlot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<AsPhotoSlot, string>>>({});

  useEffect(
    () => () => {
      Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u));
    },
    [previews],
  );

  function pick(slot: AsPhotoSlot, file?: File) {
    const next = { ...files };
    const nextPrev = { ...previews };
    if (nextPrev[slot]) URL.revokeObjectURL(nextPrev[slot]!);
    if (file) {
      next[slot] = file;
      nextPrev[slot] = URL.createObjectURL(file);
    } else {
      delete next[slot];
      delete nextPrev[slot];
    }
    setFiles(next);
    setPreviews(nextPrev);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-medium text-muted">증상 사진 (선택, 최대 3장)</legend>
      <div className="grid grid-cols-3 gap-3">
        {AS_PHOTO_SLOTS.map((slot) => {
          const url = previews[slot];
          return (
            <FileDropCard
              key={slot}
              label={AS_PHOTO_SLOT_LABELS[slot]}
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              preview={url ? { kind: "image", url } : null}
              onPick={(f) => pick(slot, f)}
              onClear={() => pick(slot, undefined)}
              hint="jpg · png · webp"
            />
          );
        })}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 2: typecheck + 시각 검증**

Run: `pnpm --filter web typecheck`
시각: AS 신청 폼(`/support`)에서 증상사진 3칸이 드롭존 카드로. (모바일은 `capture`로 카메라 직행 — 데스크톱 시각 확인은 클릭 동작으로 갈음.)

- [ ] **Step 3: 커밋**

```bash
git add "apps/web/src/app/(portal)/support/_components/AsPhotoUploader.tsx"
git commit -m "feat: AS 증상사진 3슬롯을 드롭존 카드로(모바일 카메라 유지)"
```

---

### Task 6: equipment e2e 보강 + 전체 게이트 + 시각 검증 종합

**Files:**
- Modify: `apps/web/e2e/equipment.spec.ts` (BannerUploader/CatalogUploader 첨부 회귀 추가)

**배경:** 4곳 중 관리자 2곳(Banner/Catalog)은 equipment edit 폼 안에 있고 admin 로그인 e2e가 이미 존재한다. hidden input + `setInputFiles`로 회귀 1개를 추가해, 드롭존 카드가 폼에 정상 연결됨을 자동 검증한다. (견적신청/AS는 anon storage 업로드 의존이라 시각 검증으로 갈음 — 이번 범위 밖.)

- [ ] **Step 1: equipment.spec.ts에 자산 첨부 단언 추가**

기존 `equipment.spec.ts`에서 ImageUploader에 `setInputFiles` 하는 테스트(§3, `input[type="file"].hidden`) 부근에, 견적서 로고/카탈로그 칸이 드롭존 카드로 렌더되는지 확인하는 단언을 추가한다. 정확한 위치·픽스처는 기존 테스트 구조를 읽고 맞춘다. 최소 형태:

```ts
// 견적서 로고/이미지·카탈로그가 드롭존 카드(접근명 "… 첨부")로 보인다
await expect(page.getByRole("button", { name: "장비 네임 로고 (견적서 좌하단) 첨부" })).toBeVisible();
await expect(page.getByRole("button", { name: "제품 카탈로그 (PDF) 첨부" })).toBeVisible();
```

- [ ] **Step 2: 로컬 e2e 사전 준비(클린 reset + 시드)**

CLAUDE.md 게이트 규칙: e2e는 클린 상태에서만.

```bash
npx supabase db reset
bash supabase/seed/seed-local.sh
```
Expected: 마이그 전부 적용 + admin/sales 로그인 시드 복구.

- [ ] **Step 3: 전체 게이트 실행**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web test:e2e
pnpm --filter web build
```
Expected: 모두 통과. `as any` 0(typecheck/lint로 커버).

- [ ] **Step 4: 시각 검증 종합(browse → Read 대조)**

4개 화면을 각각 빈 상태/채운 상태로 캡처해 Read로 확인:
- `/request` 현장사진 4칸 (빈/선택 후)
- `/support` 증상사진 3칸
- 장비 편집(관리자) 견적서 로고/이미지 2칸 + 카탈로그 1칸
체크: ① 점선 박스가 "여기가 첨부 위치"임을 한눈에 보여주는가 ② 슬롯명 캡션이 보이는가 ③ 선택 후 썸네일/파일명 + ✕ 가 뜨는가 ④ DESIGN 톤(드롭존 색·radius)이 ImageUploader와 일치하는가.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/e2e/equipment.spec.ts
git commit -m "test(e2e): 견적서 자산·카탈로그 드롭존 카드 렌더 회귀"
```

---

## Self-Review

- **Spec coverage:** FileDropCard 신설(T1) · 4곳 적용(T2 BannerUploader · T3 CatalogUploader · T4 SitePhotoUploader · T5 AsPhotoUploader) · 무변경 보장(각 task가 콜백/Storage 로직 유지) · 테스트·게이트·시각검증(T6) — spec의 모든 결정 커버. 프로필 제외·슬롯 유지·DESIGN 톤 반영됨.
- **Placeholder scan:** 코드 블록은 전부 실제 구현. T6 Step1만 "기존 테스트 구조에 맞춰 위치 조정"으로 열어둠(기존 spec 파일 형태 의존이라 불가피 — 최소 단언 코드 제공).
- **Type consistency:** `FileDropPreview`/`FileDropCardProps`가 T1에서 정의되고 T2~T5가 동일 prop명(`label`/`accept`/`capture`/`preview`/`onPick`/`onClear`/`busy`/`hint`/`icon`) 사용. 각 Uploader의 부모 콜백 시그니처 불변 — 부모 무수정 확인.

## 비목표 (YAGNI)
- 프로필 아바타 변경 · 슬롯→자유첨부 전환 · 이미지 압축/진행률 바 · ImageUploader 리팩터링.
