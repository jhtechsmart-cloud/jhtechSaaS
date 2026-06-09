# 의뢰관리 메인 프레임 재구성 (슬라이스 3a) 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/applications/[id]` 오른쪽 패널을, 견적이 있으면 네이비 히어로 + 좌측 본문 + 우측 sticky QUOTE SUMMARY의 견적 중심 상세로 재구성한다 (기존 데이터, DB 변경 0, 읽기전용).

**Architecture:** `page.tsx`(서버)가 application·quotes·선택견적·장비매칭을 페치하고 견적 유무로 분기. 표시는 `_components/quote-frame/`의 작은 프레젠테이션 컴포넌트들로 위임. 장비 이름매칭·유효기간은 순수 로직으로 분리·TDD.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트), Supabase(server client), Tailwind(DESIGN.md 토큰), Vitest, Playwright.

설계 원본: `docs/superpowers/specs/2026-06-09-applications-quote-frame-design.md`

---

## 파일 구조

| 파일 | 책임 | 신규/변경 |
|---|---|---|
| `apps/web/src/lib/quotes/banner.ts` | 유효기간 상수 30→15 | 변경 |
| `apps/web/src/lib/quotes/banner.test.ts` | 15일 단언 | 변경 |
| `apps/web/src/lib/quotes/equipment-match.ts` | 견적 item 이름 ↔ 장비 매칭(순수) + 서버 조회 래퍼 | 신규 |
| `apps/web/src/lib/quotes/equipment-match.test.ts` | 매칭 단위 | 신규 |
| `apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteHero.tsx` | 네이비 히어로 + 4스탯 | 신규 |
| `.../quote-frame/VersionHistory.tsx` | 버전 이력 표(행=`?v=` 링크) | 신규 |
| `.../quote-frame/ApplicantInfo.tsx` | 신청기업 정보 그리드 + 요청 배경 | 신규 |
| `.../quote-frame/InstallSurvey.tsx` | 설치설문(보존, page.tsx에서 추출) | 신규 |
| `.../quote-frame/SitePhotos.tsx` | 현장 사진(보존, page.tsx에서 추출) | 신규 |
| `.../quote-frame/SelectedEquipment.tsx` | 선택 장비 카드(매칭 시 이미지·카테고리) | 신규 |
| `.../quote-frame/OptionLists.tsx` | 포함 옵션 + 추가 옵션 | 신규 |
| `.../quote-frame/QuoteSummaryPanel.tsx` | 우측 sticky 요약 패널 | 신규 |
| `.../quote-frame/Placeholders.tsx` | 특기사항·영업일지 "준비중" 비활성 | 신규 |
| `apps/web/src/app/admin/applications/[id]/page.tsx` | 페치 + 분기 + 조립 | 변경(재구성) |
| `apps/web/src/app/admin/quotes/[id]/page.tsx` | → applications 페이지 리다이렉트 | 변경 |
| `apps/web/e2e/applications.spec.ts` | 새 구조 셀렉터 | 변경 |
| `apps/web/e2e/quotes.spec.ts` | 새 구조 셀렉터 | 변경 |

---

## Task 1: 견적 유효기간 15일로 정정

**Files:**
- Modify: `apps/web/src/lib/quotes/banner.ts`
- Test: `apps/web/src/lib/quotes/banner.test.ts`

- [ ] **Step 1: 테스트를 15일 기준으로 변경(실패 유도)**

`banner.test.ts`의 "computeQuoteValidity" describe 블록 안 단언을 15일로 교체:

```typescript
  test("발행일+15일을 KST YYYY-MM-DD로 표시", () => {
    // 발행 2026-06-09(KST) → 만료 2026-06-24(KST)
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-09T10:00:00+09:00"));
    expect(v?.validUntilLabel).toBe("2026-06-24");
  });

  test("오늘이 발행일이면 D-15(만료까지 15일)", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-09T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(15);
  });

  test("만료일 당일이면 D-0", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-24T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(0);
  });

  test("만료 후면 음수(지남)", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-27T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(-3);
  });
```

그리고 "UTC 자정 직전" 테스트의 기대 만료일을 `2026-06-24`로 변경:

```typescript
  test("UTC 자정 직전 발행도 KST 날짜로 정확히 계산", () => {
    // 2026-06-09T14:30:00Z = 2026-06-09 23:30 KST → 만료 2026-06-24 KST
    const v = computeQuoteValidity("2026-06-09T14:30:00Z", new Date("2026-06-09T15:00:00Z"));
    expect(v?.validUntilLabel).toBe("2026-06-24");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/quotes/banner.test.ts`
Expected: FAIL (현재 상수 30일이라 2026-07-09/D-30 반환)

- [ ] **Step 3: 상수 변경**

`banner.ts`에서:
```typescript
const VALID_DAYS = 15;
```
(주석도 "발행일 + 30일" → "발행일 + 15일"로, 헤더 주석 포함.)

- [ ] **Step 4: 통과 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/quotes/banner.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/quotes/banner.ts apps/web/src/lib/quotes/banner.test.ts
git commit -m "fix: 견적 유효기간 발행일+15일로 정정 (목표 견적서 명시)"
```

---

## Task 2: 장비 이름매칭 순수 로직

**Files:**
- Create: `apps/web/src/lib/quotes/equipment-match.ts`
- Test: `apps/web/src/lib/quotes/equipment-match.test.ts`

견적 item 이름(예 "JP1113", "UV3300S")을 장비 카탈로그의 name 또는 model과 정규화 대조한다. 정규화 = 소문자 + 공백/하이픈 제거.

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// 견적 item 이름 ↔ 장비 카탈로그 매칭 — 서버 의존 없이 단위테스트.
import { describe, expect, test } from "vitest";
import { matchEquipmentName, type MatchableEquipment } from "./equipment-match";

const eq = (over: Partial<MatchableEquipment>): MatchableEquipment => ({
  id: "id", name: "JP1113", model: "JP1113", category: "평판커팅기", photos: [], ...over,
});

describe("matchEquipmentName — 이름/모델 정규화 대조", () => {
  const list = [
    eq({ id: "a", name: "JP1113", model: "JP1113" }),
    eq({ id: "b", name: "XTRA R16", model: "R16", category: "라우터" }),
  ];

  test("정확히 일치하면 그 장비", () => {
    expect(matchEquipmentName("JP1113", list)?.id).toBe("a");
  });

  test("모델로도 매칭(이름이 모델과 다를 때)", () => {
    expect(matchEquipmentName("R16", list)?.id).toBe("b");
  });

  test("대소문자·공백·하이픈 무시", () => {
    expect(matchEquipmentName("xtra-r 16", list)?.id).toBe("b");
  });

  test("미매칭이면 null", () => {
    expect(matchEquipmentName("없는장비", list)).toBeNull();
  });

  test("빈 이름이면 null", () => {
    expect(matchEquipmentName("", list)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/quotes/equipment-match.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```typescript
// 견적 item 이름을 장비 카탈로그(name/model)와 best-effort 매칭한다.
// 견적 item은 equipment_id를 저장하지 않으므로(스냅샷) 이름으로 추정한다 — 미매칭은 호출측에서 텍스트 폴백.

export type MatchableEquipment = {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
};

// 소문자 + 영숫자/한글만(공백·하이픈·기호 제거).
function norm(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

export function matchEquipmentName<T extends { name: string; model: string | null }>(
  itemName: string,
  list: T[],
): T | null {
  const key = norm(itemName);
  if (key === "") return null;
  return (
    list.find((e) => norm(e.name) === key || (e.model != null && norm(e.model) === key)) ?? null
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/web && pnpm exec vitest run src/lib/quotes/equipment-match.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/quotes/equipment-match.ts apps/web/src/lib/quotes/equipment-match.test.ts
git commit -m "feat: 견적 item 이름 ↔ 장비 카탈로그 매칭 순수 로직"
```

---

## Task 3: 장비 매칭 서버 조회 래퍼

**Files:**
- Modify: `apps/web/src/lib/quotes/equipment-match.ts` (서버 함수 추가)

활성 장비(이름·모델·카테고리·사진)와 각 장비의 포함/추가 옵션을 한 번에 로드한다. RLS·권한은 기존 equipment 정책 그대로.

- [ ] **Step 1: 서버 함수 추가**

`equipment-match.ts` 상단에 `import "server-only"`를 **추가하지 않는다**(순수 함수가 클라에서도 import 가능해야 함). 대신 서버 함수는 동적 import로 supabase를 쓰되, 이 파일은 서버에서만 호출되므로 분리 파일로 둔다. → **새 파일 `equipment-match.server.ts`** 생성:

```typescript
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchableEquipment } from "./equipment-match";

export type EquipmentOption = { kind: "included" | "extra"; name: string; price: string };
export type MatchableEquipmentWithOptions = MatchableEquipment & { options: EquipmentOption[] };

// 활성 장비 + 옵션 + 카테고리명. 매칭 후보 풀(운영 장비 소수라 전량 로드 OK).
export async function listEquipmentForMatch(): Promise<MatchableEquipmentWithOptions[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, model, photos, equipment_category:category_id(name), equipment_option(kind, name, price)")
    .eq("status", "active");
  if (error) {
    console.error("[equipment-match] 장비 조회 실패", error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.equipment_category as { name?: string } | null;
    const opts = (row.equipment_option as Array<Record<string, unknown>> | null) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      model: (row.model as string | null) ?? null,
      category: cat?.name ?? null,
      photos: (row.photos as string[] | null) ?? [],
      options: opts.map((o) => ({
        kind: o.kind as "included" | "extra",
        name: o.name as string,
        price: String(o.price ?? "0"),
      })),
    };
  });
}
```

- [ ] **Step 2: 빌드·타입 확인(테스트 불가 — DB 조회)**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS (에러 없음)

> 검증 노트: `equipment_option`·`model`·`photos` 컬럼이 스키마에 존재함은 설계 탐색에서 확인됨(`supabase/migrations/20260529150003_equipment.sql`). 런타임 동작은 Task 9 시각확인에서 검증.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/quotes/equipment-match.server.ts
git commit -m "feat: 활성 장비+옵션 매칭 후보 서버 조회"
```

---

## Task 4: 히어로 + 버전 이력 컴포넌트

**Files:**
- Create: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteHero.tsx`
- Create: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/VersionHistory.tsx`

프레젠테이션 전용(서버 컴포넌트, 상태 없음). DESIGN.md 토큰 사용. 식별자·금액 = `font-mono tabular-nums`.

- [ ] **Step 1: QuoteHero 작성**

```tsx
import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import type { QuoteValidity } from "@/lib/quotes/banner";

const won = (s: string) => `₩${Number(s).toLocaleString("ko-KR")}`;

// 네이비 히어로 — 견적 식별·상태 + 4스탯. 견적 없으면 quote=null로 4스탯 숨김.
export function QuoteHero({
  company, status, seqNo, version, quoteNo, assigneeName, validity, total, issuedAtLabel,
}: {
  company: string;
  status: ApplicationStatus;
  seqNo: string | null;
  version: number | null;
  quoteNo: string | null;
  assigneeName: string | null;
  validity: QuoteValidity | null;
  total: string | null;
  issuedAtLabel: string | null;
}) {
  return (
    <div className="-mx-6 -mt-6 mb-6 bg-[var(--color-accent-deep,#0B1F3A)] px-6 py-5 text-white">
      <div className="flex items-baseline gap-3">
        {version != null && <span className="text-micro font-medium tracking-wide text-white/60">QUOTE · V{version}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-semibold">{company}</h1>
        <ApplicationStatusBadge status={status} />
        {seqNo && <span className="font-mono tabular-nums text-small text-white/70">{seqNo}</span>}
        {issuedAtLabel && <span className="text-small text-white/60">· {issuedAtLabel}</span>}
      </div>
      {quoteNo && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 md:grid-cols-4">
          <Stat label="견적번호" value={quoteNo} mono />
          <Stat label="담당자" value={assigneeName ?? "미배정"} />
          <Stat label="유효기간" value={validity ? `15일 (~${validity.validUntilLabel.slice(5)})` : "발행 시 시작"} />
          <Stat label="합계금액" value={total ? won(total) : "-"} gold mono />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, gold }: { label: string; value: string; mono?: boolean; gold?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-white/55">{label}</div>
      <div className={`truncate text-h2 font-semibold ${gold ? "text-amber-300" : "text-white"} ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}
```

> 노트: `--color-accent-deep`가 토큰에 없으면 globals.css의 딥네이비 값(#0B1F3A)을 fallback으로 인라인. DESIGN.md에 딥네이비 토큰이 있으면 그 변수명으로 교체(Task 9 시각확인에서 정렬).

- [ ] **Step 2: VersionHistory 작성**

```tsx
import Link from "next/link";
import type { QuoteListItem } from "@/lib/quotes/queries";

const won = (s: string) => `${Number(s).toLocaleString("ko-KR")}원`;
const dt = (iso: string) => `${iso.slice(0, 10)} · ${iso.slice(11, 16)}`;

// 버전 이력 표 — 행 클릭(=링크)으로 ?v=<id> 전환. 현재 표시 버전 강조.
export function VersionHistory({
  applicationId, quotes, currentQuoteId,
}: {
  applicationId: string;
  quotes: QuoteListItem[];
  currentQuoteId: string;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">버전 이력 ({quotes.length}개 버전)</h2>
        <span className="text-micro text-muted">행을 클릭하면 해당 버전을 표시합니다</span>
      </div>
      <div className="overflow-hidden rounded-sm border border-border">
        <table className="w-full text-small">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">버전</th>
              <th className="px-3 py-2 text-left font-medium">견적번호</th>
              <th className="px-3 py-2 text-left font-medium">발급일시</th>
              <th className="px-3 py-2 text-right font-medium">합계금액</th>
              <th className="px-3 py-2 text-left font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quotes.map((q) => {
              const active = q.id === currentQuoteId;
              return (
                <tr key={q.id} className={active ? "bg-accent-soft" : "hover:bg-surface-2"}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/applications/${applicationId}?v=${q.id}`} className="font-medium text-accent">
                      v{q.version}{active ? " 현재" : ""}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-text">{q.quote_no}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-muted">{q.issued_at ? dt(q.issued_at) : dt(q.created_at)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text">{won(q.total)}</td>
                  <td className="px-3 py-2 text-muted">{q.status === "issued" ? "발행" : "임시"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteHero.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/VersionHistory.tsx"
git commit -m "feat: 견적 프레임 히어로 + 버전 이력 컴포넌트"
```

---

## Task 5: 신청기업 정보 + 설치설문 + 현장사진 (보존 추출)

**Files:**
- Create: `.../quote-frame/ApplicantInfo.tsx`
- Create: `.../quote-frame/InstallSurvey.tsx`
- Create: `.../quote-frame/SitePhotos.tsx`

기존 `page.tsx`의 고객정보·요청내용·설치설문·현장사진 렌더를 컴포넌트로 추출(보존). 신청기업 정보는 그리드형으로 재배치.

- [ ] **Step 1: ApplicantInfo 작성**

```tsx
import Link from "next/link";

type Field = { label: string; value: string | null; mono?: boolean };

// 신청기업 정보 그리드 + 요청 배경. 주업종·사업자등록일은 후속(없으면 미표시).
export function ApplicantInfo({
  companyId, fields, requirements, equipmentName,
}: {
  companyId: string | null;
  fields: Field[];
  requirements: string | null;
  equipmentName: string | null;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">신청기업 정보</h2>
        <span className="text-micro text-muted">접수 시 자동 수집</span>
      </div>
      {companyId && (
        <Link href={`/admin/customers/${companyId}`} className="mb-2 inline-block text-small font-medium text-accent hover:underline">
          이 고객의 통합 이력 보기 →
        </Link>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-micro text-muted">{f.label}</div>
            <div className={`text-body text-text ${f.mono ? "font-mono tabular-nums" : ""}`}>{f.value || "-"}</div>
          </div>
        ))}
      </div>
      {equipmentName && (
        <div className="mt-3 border-t border-border pt-3">
          <span className="text-small text-muted">요청 장비 </span>
          <span className="text-body font-medium text-text">{equipmentName}</span>
        </div>
      )}
      {requirements && (
        <div className="mt-3 rounded-sm border-l-2 border-accent bg-surface-2 p-3">
          <p className="whitespace-pre-wrap text-body text-text">{requirements}</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: InstallSurvey + SitePhotos 추출**

기존 `page.tsx`의 "설치 설문" 섹션(127~140행 라벨맵 로직)과 "현장 사진" 섹션(142~154행 서명URL 렌더)을 각각 컴포넌트로 옮긴다. props로 이미 계산된 값(survey 라벨 배열, signed url 배열)을 받는다.

`InstallSurvey.tsx`:
```tsx
export function InstallSurvey({ rows, extra }: { rows: { label: string; value: string }[]; extra: string | null }) {
  if (rows.length === 0 && !extra) return null;
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">설치 설문</h2>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 py-1 text-body">
            <span className="w-24 shrink-0 text-small text-muted">{r.label}</span>
            <span className="text-text">{r.value}</span>
          </div>
        ))}
      </div>
      {extra && (
        <div className="mt-2"><div className="text-small text-muted">기타 요청사항</div>
          <p className="mt-1 whitespace-pre-wrap text-body text-text">{extra}</p></div>
      )}
    </section>
  );
}
```

`SitePhotos.tsx`:
```tsx
export function SitePhotos({ photos }: { photos: { slot: string; label: string; url: string }[] }) {
  if (photos.length === 0) return null;
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">현장 사진</h2>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((p) => (
          <figure key={p.slot} className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} className="aspect-[4/3] w-full rounded-sm object-cover" />
            <figcaption className="text-micro text-muted">{p.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 타입 확인**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/_components/quote-frame/ApplicantInfo.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/InstallSurvey.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/SitePhotos.tsx"
git commit -m "feat: 신청기업 정보 그리드 + 설치설문·현장사진 컴포넌트 추출"
```

---

## Task 6: 선택 장비 + 옵션 리스트 + 요약 패널 + 플레이스홀더

**Files:**
- Create: `.../quote-frame/SelectedEquipment.tsx`
- Create: `.../quote-frame/OptionLists.tsx`
- Create: `.../quote-frame/QuoteSummaryPanel.tsx`
- Create: `.../quote-frame/Placeholders.tsx`

- [ ] **Step 1: SelectedEquipment 작성**

```tsx
import type { MatchableEquipmentWithOptions } from "@/lib/quotes/equipment-match.server";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
export type QuoteItemRow = { name: string; unitPrice: number; quantity: number };

// 선택 장비 — 매칭된 장비가 있으면 이미지·카테고리·기본공급가, 없으면 텍스트 라인.
export function SelectedEquipment({
  items, matched, quoteNo,
}: {
  items: QuoteItemRow[];
  matched: (MatchableEquipmentWithOptions | null)[]; // items와 동일 인덱스
  quoteNo: string;
}) {
  const supplyTotal = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">선택 장비</h2>
        <span className="text-micro text-muted">기본 공급가 {won(supplyTotal)}</span>
      </div>
      <ul className="flex flex-col gap-4">
        {items.map((it, i) => {
          const eq = matched[i];
          return (
            <li key={i} className="flex flex-col gap-3 sm:flex-row">
              {eq && eq.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eq.photos[0]} alt={it.name} className="h-32 w-44 shrink-0 rounded-sm object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                {eq?.category && <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-micro font-medium text-accent">{eq.category}</span>}
                <div className="mt-1 text-h2 font-semibold text-text">{it.name}</div>
                <div className="mt-2 flex flex-col gap-1 text-small">
                  <Row label="기본 공급가" value={`${won(it.unitPrice)} (VAT 별도)`} />
                  <Row label="수량" value={`${it.quantity}`} />
                  {eq && <Row label="포함 옵션" value={`${eq.options.filter((o) => o.kind === "included").length}개`} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex justify-end border-t border-border pt-2">
        <span className="font-mono tabular-nums text-small text-muted">견적번호 {quoteNo}</span>
      </div>
    </section>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3"><span className="w-20 shrink-0 text-muted">{label}</span>
      <span className="font-mono tabular-nums text-text">{value}</span></div>
  );
}
```

- [ ] **Step 2: OptionLists 작성**

```tsx
import type { EquipmentOption } from "@/lib/quotes/equipment-match.server";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
type ExtraRow = { name: string; unitPrice: number; quantity: number };

// 포함 옵션(매칭 장비의 kind=included) + 추가 옵션(견적 options).
export function OptionLists({ included, extra }: { included: EquipmentOption[]; extra: ExtraRow[] }) {
  return (
    <>
      {included.length > 0 && (
        <section className="rounded-md border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-h2 font-medium text-text">포함 옵션</h2>
            <span className="text-micro text-muted">{included.length}개 · 기본 공급가 포함</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {included.map((o, i) => (
              <div key={i} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-small text-text">
                <span className="text-accent">✓</span> {o.name}
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-md border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-h2 font-medium text-text">추가 옵션</h2>
          <span className="text-micro text-muted">개별 견적 항목</span>
        </div>
        {extra.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border py-6 text-center text-small text-muted">선택된 추가 옵션이 없습니다.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {extra.map((o, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-body">
                <span className="min-w-0 flex-1 truncate text-text">{o.name}</span>
                <span className="font-mono tabular-nums text-small text-muted">{o.unitPrice.toLocaleString("ko-KR")} × {o.quantity}</span>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums text-small text-text">{won(o.unitPrice * o.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 3: QuoteSummaryPanel 작성**

```tsx
import Link from "next/link";

const won = (s: string | number) => `₩${Number(s).toLocaleString("ko-KR")}`;

// 우측 sticky 요약 패널 — 소계·합계·발급정보·발송정보. 메일발송은 비활성(후속).
export function QuoteSummaryPanel({
  applicationId, quoteId, quoteNo, statusLabel, equipmentSubtotal, optionSubtotal, total,
  issuedAtLabel, validUntilLabel, assigneeName, email, phone, pdfUrl, canReissue,
}: {
  applicationId: string; quoteId: string; quoteNo: string; statusLabel: string;
  equipmentSubtotal: number; optionSubtotal: number; total: string;
  issuedAtLabel: string | null; validUntilLabel: string | null; assigneeName: string | null;
  email: string | null; phone: string | null; pdfUrl: string | null; canReissue: boolean;
}) {
  return (
    <div className="sticky top-0 flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-mono tabular-nums text-small font-medium text-text">{quoteNo}</div>
          <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-micro text-muted">{statusLabel}</span>
        </div>
        <SubRow label="장비 소계" value={won(equipmentSubtotal)} />
        <SubRow label="옵션 소계" value={won(optionSubtotal)} />
        <div className="my-3 rounded-md bg-amber-50 px-3 py-2">
          <div className="text-micro text-muted">합계 금액</div>
          <div className="font-mono tabular-nums text-h1 font-bold text-amber-700">{won(total)}</div>
          <div className="text-micro text-muted">VAT 별도 · 유효 15일</div>
        </div>
        <div className="flex gap-2">
          {canReissue && (
            <Link href={`/admin/applications/${applicationId}/quote/new?from=${quoteId}`} className="flex-1 rounded-md border border-border py-2 text-center text-small font-medium text-text">수정</Link>
          )}
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-md bg-accent py-2 text-center text-small font-medium text-white">견적서 출력</a>
          ) : (
            <span className="flex-1 cursor-not-allowed rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">견적서 출력</span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-small">
          <Meta label="발급일" value={issuedAtLabel ?? "미발행"} />
          <Meta label="유효기간" value={validUntilLabel ? `${validUntilLabel} (15일)` : "발행 시 시작"} />
          <Meta label="담당자" value={assigneeName ?? "미배정"} />
        </div>
        <div className="mt-3 border-t border-border pt-3 text-small">
          <div className="mb-1 text-micro text-muted">발송 정보</div>
          <Meta label="이메일" value={email ?? "-"} />
          <Meta label="연락처" value={phone ?? "-"} mono />
        </div>
      </section>
    </div>
  );
}
function SubRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-1 text-small"><span className="text-muted">{label}</span><span className="font-mono tabular-nums text-text">{value}</span></div>;
}
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value}</span></div>;
}
```

- [ ] **Step 4: Placeholders 작성**

```tsx
// 후속 슬라이스 기능 자리 — 비활성 "준비중". 가짜 데이터 없음(레이아웃만).
export function SalesLogPlaceholder() {
  return (
    <section className="rounded-md border border-dashed border-border bg-surface p-4 opacity-70">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-muted">영업일지</h2>
        <span className="text-micro text-muted">내부용 · 준비중(후속)</span>
      </div>
      <div className="rounded-sm bg-surface-2 px-3 py-6 text-center text-small text-muted">후속 슬라이스에서 활성화됩니다.</div>
    </section>
  );
}
export function SpecialNotesPlaceholder() {
  return (
    <section className="rounded-md border border-dashed border-border bg-surface p-4 opacity-70">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-muted">특기사항</h2>
        <span className="text-micro text-muted">견적서 출력용 · 준비중(후속)</span>
      </div>
      <div className="rounded-sm bg-surface-2 px-3 py-6 text-center text-small text-muted">후속 슬라이스에서 활성화됩니다.</div>
    </section>
  );
}
```

- [ ] **Step 5: 타입 확인 + 커밋**

Run: `cd apps/web && pnpm typecheck` → PASS
```bash
git add "apps/web/src/app/admin/applications/[id]/_components/quote-frame/SelectedEquipment.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/OptionLists.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteSummaryPanel.tsx" "apps/web/src/app/admin/applications/[id]/_components/quote-frame/Placeholders.tsx"
git commit -m "feat: 선택장비·옵션·요약패널·후속 플레이스홀더 컴포넌트"
```

---

## Task 7: page.tsx 재구성 (페치 + 분기 + 조립)

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/page.tsx`

기존 슬라이스2 상단바·배너·하단 섹션을 새 프레임으로 교체. `searchParams.v`로 표시 버전 선택. 견적 유무 분기.

- [ ] **Step 1: page.tsx 재작성**

핵심 흐름(전체 코드는 기존 page.tsx 패턴 + 아래 구조):
1. `const { id } = await params; const sp = await searchParams;` — Next 16은 `searchParams`도 Promise.
2. 가드(`requireApplicationsConsole`) + `getApplicationForAdmin(id)`.
3. `const quotes = await listQuotesForApplication(id);`
4. 표시 견적 선택:
```typescript
const vParam = typeof sp.v === "string" ? sp.v : null;
const selected = vParam && quotes.some((q) => q.id === vParam)
  ? quotes.find((q) => q.id === vParam)!
  : pickRepresentativeQuote(quotes); // 슬라이스2 재사용
const quote = selected ? await getQuote(selected.id) : null;
```
5. 장비 매칭(견적 있을 때만):
```typescript
let matched: (MatchableEquipmentWithOptions | null)[] = [];
let includedOpts: EquipmentOption[] = [];
if (quote) {
  const items = parseQuoteLines(quote.items);
  const catalog = await listEquipmentForMatch();
  matched = items.map((it) => matchEquipmentName(it.name, catalog));
  includedOpts = matched.flatMap((e) => e?.options.filter((o) => o.kind === "included") ?? []);
}
```
6. 유효기간: `const validity = quote?.issued_at ? computeQuoteValidity(quote.issued_at, new Date()) : null;`
7. 사진 서명 URL·설문 라벨: 기존 로직 유지(InstallSurvey/SitePhotos props로 가공).
8. 렌더:
```tsx
return (
  <div>
    <QuoteHero company={...} status={status} seqNo={r.seq_no} version={quote ? selected!.version : null}
      quoteNo={quote ? quote.quote_no : null} assigneeName={assigneeName}
      validity={validity} total={quote?.total ?? null} issuedAtLabel={...} />
    {quote ? (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <VersionHistory applicationId={id} quotes={quotes} currentQuoteId={selected!.id} />
          <ApplicantInfo ... />
          <InstallSurvey ... /> <SitePhotos ... />
          <SelectedEquipment items={items} matched={matched} quoteNo={quote.quote_no} />
          <OptionLists included={includedOpts} extra={parseQuoteLines(quote.options)} />
          <SpecialNotesPlaceholder />
        </div>
        <div className="flex flex-col gap-6">
          <QuoteSummaryPanel ... equipmentSubtotal={sum(items)} optionSubtotal={sum(options)} total={quote.total}
            pdfUrl={quote.status === "issued" ? (quote as {pdf_url?: string}).pdf_url ?? null : null} canReissue={canQuote} />
          <SalesLogPlaceholder />
        </div>
      </div>
    ) : (
      // 견적 없음 폴백
      <div className="flex max-w-3xl flex-col gap-6">
        <ApplicantInfo ... /> <InstallSurvey ... /> <SitePhotos ... />
        {canQuote && <Link href={`/admin/applications/${id}/quote/new`} className="...">견적 작성</Link>}
      </div>
    )}
  </div>
);
```

> 주의:
> - `getQuote`는 `pdf_url`을 select하지 않음 → `lib/quotes/queries.ts`의 `QuoteDetail`·getQuote select에 `pdf_url` 추가(작은 변경, DB 변경 아님).
> - `sum(items) = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0)` 인라인 헬퍼.
> - 담당자/상태 변경 컨트롤(AssignControl/StatusControl)은 이 슬라이스에서 히어로에 넣지 않는다(읽기전용 프레임). 슬라이스2의 변경 UI는 후속에서 히어로에 통합 — 단, **기존 e2e(담당 저장·상태 변경)가 깨지므로 Task 8에서 처리**.

- [ ] **Step 2: queries.ts에 pdf_url 추가**

`QuoteDetail` 타입에 `pdf_url: string | null;` 추가, getQuote select 문자열에 `pdf_url` 추가.

- [ ] **Step 3: 빌드·타입·lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/admin/applications/[id]/page.tsx" apps/web/src/lib/quotes/queries.ts
git commit -m "feat: 의뢰 상세를 견적 중심 프레임으로 재구성 (히어로+본문+sticky 요약)"
```

---

## Task 8: 담당자·상태 변경 처리 + e2e 갱신

**Files:**
- Modify: `apps/web/e2e/applications.spec.ts`
- Modify: `apps/web/e2e/quotes.spec.ts`

> 결정 필요(실행 중 사용자 확인): 읽기전용 프레임이 담당자·상태 **변경** 컨트롤을 제거하면 e2e(`담당 저장`·`상태 변경`·`내가 맡기`)와 실제 운영 동작이 사라진다. **최소 변경안**: 히어로 아래 얇은 "처리 바"에 슬라이스2의 `AssignControl`·`StatusControl`·`ClaimButton`을 그대로 유지(읽기전용 프레임 + 처리 바 1줄). 이러면 e2e 셀렉터(담당 저장/상태 변경/app-status 배지)도 보존된다.

- [ ] **Step 1: 처리 바 유지 결정 반영**

page.tsx 히어로 직후에 슬라이스2의 담당자·상태 컨트롤(배지+컨트롤)을 1줄 처리 바로 유지. `ApplicationStatusBadge`(testid app-status)는 히어로에 이미 있으므로 중복 방지 위해 처리 바에는 컨트롤만(배지 제외) 두거나, 히어로 배지를 readout으로 쓰고 처리 바는 select+button만.

- [ ] **Step 2: e2e 셀렉터 확인·갱신**

`applications.spec.ts`: 접수번호·미등록 고객·담당 저장·상태 변경·app-status 단언이 새 구조(히어로/처리바)에서 동작하는지 셀렉터 확인. seq_no는 히어로에 노출(`/REQ-\d{8}-\d+/` 유지). `미등록 고객`은 ApplicantInfo 또는 히어로에 노출 유지.

`quotes.spec.ts`: 발행 후 의뢰 상세에서 견적 노출 단언 — 금액은 SelectedEquipment/SUMMARY/VersionHistory 여러 곳에 나오므로 `.first()` 유지. `app-status` 배지 유지. `JHQ-...-V1` 채번은 VersionHistory 표에 노출.

- [ ] **Step 3: e2e 실행**

Run(시드 복구 후): `cd /Users/seonjecho/Projects/jhtechSaaS && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e`
Expected: 46+ passed, 0 failed (셀렉터 갱신 후)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/e2e/applications.spec.ts apps/web/e2e/quotes.spec.ts "apps/web/src/app/admin/applications/[id]/page.tsx"
git commit -m "feat: 히어로 처리바 유지 + e2e 새 구조 셀렉터 갱신"
```

---

## Task 9: quotes/[id] 리다이렉트 + 게이트 + 시각확인

**Files:**
- Modify: `apps/web/src/app/admin/quotes/[id]/page.tsx`

- [ ] **Step 1: 리다이렉트로 교체**

```tsx
import { redirect } from "next/navigation";
import { getQuote } from "@/lib/quotes/queries";
import { requireApplicationsConsole } from "@/lib/auth/guard";

export default async function QuoteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireApplicationsConsole();
  const q = await getQuote(id);
  if (!q) redirect("/admin/applications");
  redirect(`/admin/applications/${q.application_id}?v=${id}`);
}
```

- [ ] **Step 2: 전체 게이트**

Run:
```bash
cd /Users/seonjecho/Projects/jhtechSaaS
pnpm --filter @jhtechsaas/shared test
cd apps/web && pnpm test && pnpm typecheck && pnpm lint && pnpm build
grep -rn "as any" src packages/shared/src 2>/dev/null | grep -v "\.test\." | wc -l   # 0
```
Expected: 모두 통과, as any 0.

- [ ] **Step 3: 시각확인(browse)**

dev 서버(로컬 env) + 샘플 3종(발행 매칭O·임시·견적없음) + `?v=` 전환 스크린샷. 히어로·버전이력·신청기업·선택장비(이미지)·sticky 요약·플레이스홀더 확인. 실 장비명(JP1113/XTRA R16 등)으로 매칭 검증.

- [ ] **Step 4: 커밋**

```bash
git add "apps/web/src/app/admin/quotes/[id]/page.tsx"
git commit -m "feat: 견적 상세 라우트를 의뢰 상세 ?v= 로 통합 리다이렉트"
```

---

## 자가검토 메모

- 스펙 커버리지: 히어로·버전이력·신청기업·설치설문·현장사진·선택장비·포함/추가옵션·요약패널·플레이스홀더·리다이렉트·15일정정·이름매칭 = Task 1~9에 모두 매핑. ✓
- ⚠️ 미해결 리스크(실행 중 결정): Task 8의 "처리 바 유지" — 읽기전용 프레임이라도 담당자·상태 변경을 어디 둘지(히어로 통합 vs 얇은 처리바). 기본안=처리바 유지(e2e·운영동작 보존). 실행자가 시각확인서 조정.
- 타입 일관성: `MatchableEquipment`(순수, photos:string[]) ↔ `MatchableEquipmentWithOptions`(서버, +options). `QuoteItemRow`/parseQuoteLines 반환 형태 일치. ✓
- DB·마이그레이션·db-tests 변경 없음. 게이트는 회귀 확인용 실행.
