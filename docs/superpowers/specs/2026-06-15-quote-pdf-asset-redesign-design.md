# 견적서 PDF 자산 재구성 — 설계 (Design Spec)

- **작성일**: 2026-06-15
- **상태**: 승인됨 (Seonje, 2026-06-15)
- **관련 코드**: `apps/worker/src/jobs/quote-html.ts`, `quote-pdf.ts`, `assets.ts` / `apps/web` 장비 폼 / `supabase/migrations`

## 한 문장 요약

견적서 PDF를 새 자산 4종(A4 배경·회사 로고·장비 이미지·장비 네임)으로 다시 짜고, 본문 세부는 렌더 결과를 보며 조정한다.

## 왜 필요한지

실제 영업용 견적서 양식(실제 장비 이미지·브랜드 로고가 들어간 디자인)으로 고객에게 발송할 수 있게 하기 위함. 현재 PDF는 장비별 상/하단 "폭 전체 배너" 방식인데, 영업 현장에서 쓰는 양식은 ① 공통 스튜디오 배경 ② 회사 로고 ③ 하단 좌우에 장비 네임 로고와 장비 사진이 들어가는 구성이다.

## 자산 4종 (출처 = `~/Downloads/SG1625/`)

| 번호 | 파일 | 용도 | 성격 | 비율(대략) |
|---|---|---|---|---|
| ① | `1_견적서배경.jpg` | A4 배경(흰 스튜디오, 하단 조명) | 고정 | A4 세로 |
| ② | `2_재현테크logo-컷팅기.png` | 회사 로고(좌상단) | 고정 | 가로형 |
| ③ | `4_SG1625-new.png` | 장비 이미지(우하단, JWEI 컷팅기) | 장비별 | 가로형 |
| ④ | `5_멀티컷SG1625-logo.png` | 장비 네임(좌하단, MULTICUT eco SG1625) | 장비별 | 가로형 |

> 정정 반영: 우하단 = 장비 이미지, 좌하단 = 장비 네임.

## 1. 데이터 모델 변경 (마이그레이션)

새 양식에서 "상/하단 폭 전체 배너" 개념이 사라지고 "하단 좌우 장비네임/장비이미지"로 바뀐다. 기존 `equipment.quote_banner_top/bottom` 컬럼 2개를 **rename + 경로 정규식 교체**로 1:1 전환한다.

- `quote_banner_bottom` → `quote_device_image` (우하단 장비 이미지)
- `quote_banner_top` → `quote_device_name` (좌하단 장비 네임)
- 경로 정규식(DB CHECK + web Zod 동시): `^equipment/[0-9a-f-]{36}/device-(image|name)\.(jpg|jpeg|png|webp)$`
- 기존 CHECK 제약(`equipment_quote_banner_top_path` 등) 드롭 후 새 이름으로 재생성.
- **운영 데이터**: Seonje 확인 — 기존 배너 업로드분은 새 양식으로 완전 대체(무의미). 마이그레이션에서 기존 값은 경로 형식이 안 맞으므로 컬럼 rename 시 `NULL`로 초기화(새 정규식 CHECK 위반 방지).
- 롤백 스크립트는 `supabase/rollback/<timestamp>_quote_device_assets_down.sql`(단수 디렉토리).
- db-test: 새 컬럼 경로 정규식 CHECK(정상 경로 통과·임의 경로 거부) 단언.

### admin 장비 폼 변경 (`apps/web`)
- `EquipmentForm.tsx`: 업로드 슬롯 2개 라벨/스토리지 경로를 새 의미로 변경
  - "견적서 상단 배너" → "장비 네임 로고(견적서 좌하단)"
  - "견적서 하단 배너" → "장비 이미지(견적서 우하단)"
- `actions.ts`: 업로드 경로 `device-image` / `device-name`으로 변경
- `lib/equipment/schema.ts`: Zod 정규식을 DB CHECK와 동일하게 교체

## 2. 워커 번들 고정 자산 (`apps/worker/assets/`)

`stamp.png`·폰트와 동일 패턴으로 2개 추가:
- `quote-bg.jpg` ← `1_견적서배경.jpg`
- `company-logo.png` ← `2_재현테크logo-컷팅기.png`

`assets.ts`에 `getQuoteBgDataUri()`·`getCompanyLogoDataUri()` 추가(1회 로드 캐시).

## 3. 레이아웃 (`quote-html.ts` 재작성)

```
배경 이미지가 페이지 전체에 깔림 (A4 세로, position:absolute/배경)
┌──────────────────────────┐
│ [재현테크 로고]    ┌─ 공급자 표 ─┐ │
│ 견적일자/번호/담당   └──────────┘ │
│              수신처 귀하        │
│ ═══════ 합계금액 밴드 ═══════  │
│ 품목표 → 장비사양 → 특기사항      │
│ [SG1625 네임]      [장비 이미지] │  ← 하단 좌우, 배경 조명 위
└──────────────────────────┘
```

- 배경은 `body`에 `background-image`(base64 인라인)로 깔고, 본문은 그 위 레이어.
- 회사 로고: 좌상단, 견적 메타 위.
- 본문(공급자 표·합계 밴드·품목표·사양·특기사항)은 **기존 구조 유지** — 자산만 새로 얹는다.
- 하단 장비 영역: 좌 = 장비 네임, 우 = 장비 이미지. 페이지 바닥 고정(현재 flex 컬럼 구조 활용). 본문이 길어 겹치는 경우는 렌더 보면서 조정.
- `QuoteHtmlData` 타입에 `quoteBgDataUri`·`companyLogoDataUri`·`deviceImageDataUri`·`deviceNameDataUri` 추가, 기존 `bannerTopDataUri`·`bannerBottomDataUri` 제거.

### `quote-pdf.ts` 변경
- equipment select: `quote_banner_top, quote_banner_bottom` → `quote_device_name, quote_device_image`
- 고정 자산 2종 로드 + 장비별 자산 2종 스토리지 다운로드(기존 `storageDataUri` 재사용)

## 4. 검증

- tsx 하니스(`_render-sample.ts` 또는 신규)로 SG1625 샘플 견적 렌더 → **Read 도구로 PDF 대조** → 반복 조정(본문 세부는 이 루프에서 다듬는다).
- 게이트: `shared test`·`web test`·`worker` 단위·`db-tests test:rls`·`web typecheck`·`lint`·`build`·`web test:e2e`·`as any` 0 모두 통과.
- db reset 후 `seed-local.sh` 필수(메모리 학습).

## 범위 밖 (YAGNI)

- 배경/로고를 장비별·관리자 업로드로 만들지 않음(고정 번들). 추후 필요 시 별도.
- 다중 페이지(품목이 1페이지 초과) 페이지네이션은 이번 범위 아님 — 현재처럼 1페이지 가정, 길면 시각 조정으로 흡수.
