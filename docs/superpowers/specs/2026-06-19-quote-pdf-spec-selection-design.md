# 견적서 PDF 사양 선택 — 설계 문서

> **한 문장 요약**: 장비 사양은 고객 신청용으로 전부 두되, 관리자가 견적서 PDF에 넣을 사양만 항목별로 골라(장비 기본 + 견적별 가감) 견적서가 한 페이지를 넘지 않게 한다.
>
> **왜 필요한가**: 지금은 장비 사양 *전부*가 견적 PDF에 들어가서, 사양이 많은 장비는 견적서가 2페이지로 넘친다. 사양은 원래 고객 신청을 돕는 용도라 전부 견적서에 넣을 필요가 없다.

- 작성일: 2026-06-19 (세션16)
- 관련 메모리: `quote-pdf-spec-selection-plan`, `jhtechsaas-project`(#148 상태 라이프사이클)
- 범위: **Phase 1 + Phase 2 한 번에** (장비 기본 선택 + 견적별 조정 + 한 페이지 하드캡)

---

## 확정 결정 (브레인스토밍 2026-06-19)

| 결정 사항 | 선택 | 비고 |
|---|---|---|
| 구현 범위 | Phase 1 + 2 | 장비 기본 선택 + 견적별 조정 + 하드캡 |
| 선택 단위 | **항목별** | 한 페이지 맞춤에 "이 항목만 빼기"가 필요 → 그룹별 불가 |
| 사양 항목 참조 | **안정 id** | 견적이 id로 참조 → 사양 편집해도 연결 유지(코드베이스 'id 보존' 원칙) |
| 미설정 장비 동작 | **전부 렌더(현 동작)** | 3단 폴백 ③. 배포해도 기존 견적·장비 무변경 |
| 하드캡 | **하드(비활성)** | 예산 초과 시 미선택 항목 체크박스 비활성. 소프트 경고 아님 |
| 기본 사양 초과 시 | 경고 + 발행 허용 | 발행 막지 않음. 워커 truncate 안전망이 받음 |
| 마이그레이션 | **2파일 분리** | ① 사양 항목 id backfill ② quotes.spec_selection 컬럼 (한 마이그=한 의도) |

---

## 1. 데이터 모델

핵심: 사양 항목에 **id(고유표식)**·**pdf(견적서 기본 포함)**를 붙이고, 견적은 **spec_selection(이 견적에 넣을 사양 id 목록)**을 따로 저장.

### 1.1 SpecItem 확장 (`packages/shared/src/specs.ts`)

```ts
export interface SpecItem {
  id: string;        // ← 신규: 안정 고유표식 (견적이 이걸로 참조)
  label: string;
  value: string;
  pdf?: boolean;     // ← 신규: 견적서 기본 포함 여부 (장비 기본값)
}
```
- `parseSpecs`: 레거시(id 없는) 항목을 읽을 때 id 없으면 결정적이지 않은 생성은 피하고, **저장 시점(serializeSpecs 또는 폼 저장)**에 id를 채운다. 화면 렌더는 id 없어도 동작(폴백).
- `serializeSpecs`: 빈 항목 제거 후 id 미존재 항목에 id 부여. `pdf`는 그대로 보존.

### 1.2 견적 spec_selection (`quotes` 테이블 + shared/web 타입)

- DB: `quotes.spec_selection jsonb` (nullable, 기본 `null`). 내용 = 사양 항목 id 문자열 배열.
- shared `QuoteLine`/web `QuoteRow`는 사양과 무관(품목 라인)이므로 **변경 없음**. spec_selection은 견적 *행* 수준 필드 → 견적 생성 RPC 입력/저장 경로에 추가.
- ⚠️ Zod `z.object`는 미정의 키 strip → `SpecItem`의 `id`·`pdf`, 견적 입력의 `spec_selection`을 스키마에 **명시**(CLAUDE.md `equipmentId` 보존 교훈과 동일).

### 1.3 3단 폴백 (하위호환의 핵심)

워커가 PDF 렌더 시 표시할 사양 항목을 거르는 우선순위:

1. `spec_selection`이 **배열**이면(빈배열 `[]` 포함) → 그 id에 해당하는 항목만 렌더. **`[]` = 관리자가 다 뺐다 = 사양 0개**(폴백으로 새지 않음).
2. `spec_selection`이 **`null`**이면(= 구 견적, 이 기능 이전) → 장비 사양 중 `pdf:true` 항목만
3. 그것도 없으면(미설정 장비 = pdf:true 항목 0개) → **전부 렌더 (= 현재 동작)**

즉 `null`과 `[]`는 다르다: `null`=미설정→폴백, `[]`=명시적 0개. 새 견적은 항상 배열을 저장(기본=장비 pdf:true id들)하므로 `null`은 구 견적에만 존재.

→ 배포해도 기존 견적·미설정 장비는 동작 불변. 관리자가 장비별 PDF 사양을 지정하는 순간부터 필터 적용.

**순수함수로 추출** (`packages/shared`): `selectPdfSpecItems(specGroups, specSelection): SpecGroup[]` — 워커·화면 공용. TDD 대상.

---

## 2. 장비 폼 + 워커 렌더

### 2.1 장비 폼 (`apps/web/.../equipment/_components/SpecEditor.tsx`)

- 각 사양 항목 행에 체크박스 1칸 추가. 체크 = `pdf:true`.
- 신규 항목 추가 시 기본값 `pdf:true`(체크됨) — 기존처럼 "다 넣기"가 기본이라 직관적.
- 항목 id는 폼 내부에서 신규 행에 부여하거나 저장 시 serializeSpecs가 채움(렌더 키와 별개의 안정 id).
- `EquipmentForm` 기본값·`equipment/schema.ts`(specGroupSchema → SpecItem에 `id`·`pdf`) 동시 업데이트.

### 2.2 워커 (`apps/worker/src/jobs/quote-pdf.ts` / `quote-html.ts`)

- 현재 `quote-pdf.ts` 라인 131-139의 specGroups 변환 직후, `selectPdfSpecItems(specGroups, spec_selection)`로 거른 뒤 빈 그룹 제거.
- `quote-html.ts`의 HTML 조립(`.specs`/`.spec-group`/`.spec-items` 2열 그리드)은 **그대로** — "무엇을 넘기느냐"만 바뀜.
- spec_selection은 견적 조회 데이터에 포함시켜 워커로 전달.

---

## 3. 견적 폼 사양 선택 + 한 페이지 하드캡

### 3.1 UI (`QuoteForm`·`ManualQuoteForm` 공통)

메인 장비가 카탈로그 장비(`equipmentId` 보유)일 때, 품목·옵션 아래에 **"견적서 사양 선택"** 섹션:
- 항목별 체크박스. 초기 체크 = 장비 `pdf:true` 항목.
- 상단에 예산 표시(예: "한 페이지 예산: 12줄 중 9줄 사용").
- **하드캡**: 예산을 다 쓰면 미선택 항목 체크박스 **비활성**.
- 공통 컴포넌트로 추출(예: `_components/SpecSelectionEditor.tsx`) → 두 폼이 공유. 선택 결과(id 배열)를 견적 생성 액션에 전달.

### 3.2 한 페이지 예산 (순수함수 TDD, `packages/shared`)

```
specBudget({ 고정오버헤드, 품목수, 옵션수, 특기줄수 }) → 최대 사양 줄 수
```
- A4 본문 높이 − 고정영역(헤더·공급자·합계·하단 장비사진) − 가변영역(품목·옵션·특기 줄) → 남는 높이 ÷ 사양 줄 높이(2열, 11.5px 기준).
- 상수는 실제 PDF 대조로 **보수적** 튜닝(픽셀 정확 불가).
- 견적 폼에서 품목/옵션/특기가 바뀔 때마다 실시간 재계산.

### 3.3 엣지케이스

- 품목·특기가 너무 길어 기본 사양(`pdf:true`)만으로 이미 예산 초과 → 폼에 경고 한 줄 + **발행 허용**(막지 않음).
- 워커 안전망: 렌더 대상이 예산 초과면 후순위부터 truncate(선택). 폼 하드캡과 이중 방어.

---

## 4. 테스트 · 마이그레이션 · 게이트

### 4.1 TDD 순수함수 (`packages/shared`, 먼저 테스트)

- `specBudget(...)` — 경계값(0 품목, 많은 특기 등)
- `selectPdfSpecItems(specGroups, specSelection)` — 3단 폴백 분기 전수
- 견적 기본 선택 계산(장비 `pdf:true` → 초기 spec_selection)

### 4.2 마이그레이션 (2파일 분리 + 각 롤백 `supabase/rollback/`)

1. `<ts>_spec_item_ids.sql` — 기존 `equipment.specs` 각 항목에 `id`(`gen_random_uuid()`) backfill. `pdf` 미설정은 폴백이 받으므로 backfill 불필요.
2. `<ts>_quotes_spec_selection.sql` — `quotes.spec_selection jsonb` nullable 추가.

### 4.3 게이트 (머지 전 전부 GREEN)

`shared test` · `web test` · `db-tests test:rls` · `web typecheck` · `lint` · `build` · `web test:e2e` · `as any` 0
- ⚠️ db-tests 전 `supabase db reset` + `seed-local.sh`(시드 복구). e2e도 클린 reset에서만.
- 머지 후 `supabase db push`(prod ref `okxmeqrvtlvmxfltsara`).

### 4.4 시각 검증

워커 `_render-sample.ts` 하니스로 사양 많은 장비 견적 렌더 → **Read 도구로 PDF 대조**(한 페이지 유지 확인). ⚠️ PNG/PDF를 cat/grep 금지(고 surrogate 컨텍스트 오염).

---

## 손댈 곳 요약

| 영역 | 파일 |
|---|---|
| shared 타입·Zod | `packages/shared/src/specs.ts`, 견적 입력 스키마 |
| shared 순수함수 | `specBudget`, `selectPdfSpecItems` (+ 테스트) |
| 마이그레이션 | `supabase/migrations/` 2파일 + `supabase/rollback/` 2파일 |
| 장비 폼 | `equipment/_components/SpecEditor.tsx`, `EquipmentForm.tsx`, `equipment/schema.ts` |
| 견적 폼 | `QuoteForm.tsx`, `ManualQuoteForm.tsx`, 신규 `SpecSelectionEditor.tsx`, 견적 생성 액션·RPC |
| 워커 | `apps/worker/src/jobs/quote-pdf.ts`, `quote-html.ts` |
| 검증 | `_render-sample.ts` 하니스, e2e |
