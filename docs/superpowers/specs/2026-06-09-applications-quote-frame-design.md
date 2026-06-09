# 의뢰관리 메인 프레임 재구성 — 설계 (2단계 / 슬라이스 3a)

> **한 문장 요약:** 의뢰관리 2분할의 오른쪽 패널(`/admin/applications/[id]`)을, 견적이 있으면 **네이비 히어로 + 좌측 본문 + 우측 sticky QUOTE SUMMARY**의 견적서 같은 견적 중심 상세로 재구성한다. 이번 슬라이스는 **기존 데이터만, DB 변경 0, 읽기전용**.
>
> **왜 필요한가:** 지금은 의뢰 상세의 정보(상태·담당자·견적·장비·회사)가 위아래로 흩어져 한눈에 안 들어온다. 영업이 고객과 통화하며 보는 화면이므로, 견적서처럼 "누가·얼마·무슨 장비·어디까지"를 한 화면에서 본다. 목표 비주얼은 사용자가 제공한 견적 상세 목업(네이비 히어로·버전이력·신청기업정보·선택장비·우측 QUOTE SUMMARY·영업일지).

이 문서는 **2단계(의뢰관리 2분할 + 견적 프레임)의 슬라이스 3a**다. 슬라이스 1(2분할 셸)·2(상단바+배너)에 이어진다.
- 슬라이스 3a (이 문서) = **읽기전용 견적 중심 프레임** (기존 데이터, 마이그레이션 0)
- 후속 3b = 특기사항(quotes 컬럼)
- 후속 3c = 영업일지(컬럼, 발행 불변모델과 분리)
- 후속 3d = 지금 메일 발송(jobs 큐 email 타입 + 워커 + 액션 + UI)
- 후속 = 회사 주업종·사업자등록일(companies 컬럼), 견적 items의 equipment_id 영속(이미지·포함옵션 정확 연결)

색·디자인은 1단계 딥네이비+스틸블루 토큰(`DESIGN.md`)을 그대로 쓴다. 북극성: "복잡한 것을 한눈에".

---

## 결정 요약 (브레인스토밍)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 첫 슬라이스 범위 | **기존 데이터 읽기전용 프레임**부터. 마이그레이션 0. 신규 데이터(특기사항·영업일지·메일·주업종)는 후속. |
| D2 | 라우팅 | `/admin/applications/[id]` 단일 페이지. `?v=<quoteId>`로 버전 전환(기본=최신). 견적 없음=상태 히어로+CTA. `/admin/quotes/[id]`는 이 페이지로 리다이렉트. |
| D3 | 선택 장비 | 견적 item 이름 → equipment **베스트 매칭**. 매칭 시 이미지·카테고리·포함옵션, 아니면 텍스트만(이름·단가·수량). |
| D4 | 후속 기능 자리 | 특기사항·영업일지·메일발송 = **비활성 "준비중(후속)" 플레이스홀더**(레이아웃은 타겟대로, 가짜 데이터 없음). |
| ⚠️ 정정 | 견적 유효기간 | **발행일 + 15일**(목표 특기사항/히어로 명시). 슬라이스2 배너가 쓴 30일은 오류 → 15일로 통일. 이 프레임이 슬라이스2 상단바·배너를 흡수. |

---

## 범위 (Scope)

**포함 (슬라이스 3a):**
- `/admin/applications/[id]/page.tsx` 재구성: 견적 유무로 분기.
  - **견적 있음** → 네이비 히어로 + 좌측 본문 + 우측 sticky QUOTE SUMMARY.
  - **견적 없음** → 상태 히어로(회사명+상태배지) + 신청기업 정보 + 설치설문 + 현장사진 + "견적 작성" CTA. (우측 SUMMARY·선택장비 숨김.)
- `?v=<quoteId>` 쿼리로 특정 버전 견적 렌더(없으면 최신). 잘못된/타 의뢰 id는 최신으로 폴백.
- 견적 item 이름 → equipment 베스트 매칭(이미지·카테고리·포함옵션). 순수 매칭 로직 분리·TDD.
- `/admin/quotes/[id]` → `/admin/applications/<app>/?v=<quoteId>` 308 리다이렉트(중복 제거).
- 유효기간 계산을 **15일**로(슬라이스2 `computeQuoteValidity`의 30일 상수 수정, 또는 이 프레임 전용 재사용).
- 후속 기능 섹션(특기사항·영업일지·메일발송)은 비활성 플레이스홀더.

**제외 (이 슬라이스 아님):**
- DB 스키마 변경 일체(특기사항·영업일지·주업종·사업자등록일 컬럼, 견적 item equipment_id). → 후속.
- 메일 발송 실제 동작(워커·jobs email 타입·액션). → 3d.
- 인라인 견적 편집·재발행 로직 변경. [수정] 버튼은 기존 `?from=` 재발행 흐름 링크만.
- 견적 작성/발행/상태전이/권한/RPC 로직 변경 — 없음.
- 모바일 좁은 화면 최적화 — 콘솔 desktop-primary. 좁은 폭은 깨지지만 않게.

---

## 아키텍처 — 데이터 페치 + 컴포넌트 분리

`page.tsx`(서버)가 데이터를 모으고 분기, 표시는 작은 컴포넌트로 위임(파일 비대화 방지). 비유: page.tsx는 "주방", 각 컴포넌트는 "접시 하나".

### 데이터 페치 (page.tsx, 서버)
1. `getApplicationForAdmin(id)` — 기존. 회사·fields(요청·설문·사진).
2. `listQuotesForApplication(id)` — 기존. 버전 목록(이미 issued_at 포함, 슬라이스2에서 추가).
3. 표시 대상 견적 선택: `?v=<quoteId>` 있으면 그 id, 없으면 대표 견적(`pickRepresentativeQuote`, 슬라이스2) → 그것의 `getQuote(quoteId)`로 items·options 로드.
4. 견적 item 이름 매칭: `matchEquipmentForItems(items)` — equipment(active) name/model 대조.
5. 회사 통합(있으면): 기존 companyId 링크.

### 컴포넌트 (신규 `_components/quote-frame/`)
| 컴포넌트 | 역할 | 데이터 |
|---|---|---|
| `QuoteHero` | 네이비 히어로: QUOTE·V{n}·회사명·상태배지·접수번호·발급일시 + 4스탯(견적번호·담당자·유효기간 15일·합계금액) | quote + application + validity |
| `VersionHistory` | 버전 이력 표(버전·견적번호·발급일시·합계·출력·변경정보). 행 = `?v=` 링크, 현재 버전 강조 | quotes[] |
| `ApplicantInfo` | 신청기업 정보 그리드(업체명·사업자번호·대표·연락처·이메일·주소·접수번호) + 요청 배경 bullets. 담당자 표시(변경은 후속/슬라이스2 컨트롤 재사용 가능) | application + company |
| `InstallSurvey`(보존) | 설치설문 라벨맵 | application.fields.install_survey |
| `SitePhotos`(보존) | 현장 사진 4슬롯(서명 URL) | application.fields.photos |
| `SelectedEquipment` | 선택 장비 카드: 매칭 시 이미지·카테고리·기본공급가, 아니면 텍스트 라인 | matched equipment + items |
| `IncludedOptions` | 포함 옵션(매칭 장비의 kind=included 체크리스트). 매칭 없으면 숨김 | equipment_option |
| `ExtraOptions` | 추가 옵션(견적 options) 또는 "선택된 추가 옵션 없음" | quote.options |
| `QuoteSummaryPanel` | 우측 sticky: 장비/옵션 소계·합계(골드)·VAT별도·유효15일 / [수정]·[장비사진]·[견적서 출력] / 발급·유효·담당자 / 발송정보 표시 | quote |
| `SalesLogPlaceholder` | 영업일지 "준비중(후속)" 비활성 | — |
| `SpecialNotesPlaceholder` | 특기사항 "준비중(후속)" 비활성 | — |

### 순수 로직 (TDD, `lib/quotes/`)
- `equipment-match.ts`: `matchEquipmentName(itemName, equipmentList) → equipment | null` — name/model 정규화 대조(공백·대소문자 무시). 조회(Supabase)는 server 래퍼로 분리.
- 유효기간: 슬라이스2 `computeQuoteValidity`의 상수를 **15일**로 수정(`VALID_DAYS = 15`). 기존 banner 테스트도 15일 기준으로 갱신.

---

## 레이아웃

```
┌─ 네이비 히어로 (풀폭) ──────────────────────────────────────┐
│ QUOTE · V1                                                  │
│ 대덕이엔에스   [견적중]  REQ-...· 2026.05.13 · 14:01          │
│ ─────────────────────────────────────────────────────────  │
│ 견적번호 260518-..  담당자 배갑중  유효기간 15일(~06-24)  합계 ₩48,000,000(골드)│
└─────────────────────────────────────────────────────────────┘
┌─ 좌측 본문 (2/3) ───────────────┐  ┌─ 우측 sticky (1/3) ──┐
│ [버전 이력 표]                  │  │ QUOTE SUMMARY        │
│ [신청기업 정보 + 요청 배경]      │  │  장비 소계 / 옵션 소계 │
│ [설치설문]  [현장사진]           │  │  합계(골드)·VAT·유효15 │
│ [선택 장비 + 포함옵션 + 추가옵션] │  │  [수정][장비사진][출력]│
│ [특기사항 — 준비중(비활성)]      │  │  발급·유효·담당자      │
│                                 │  │  발송정보(이메일·연락처)│
│                                 │  │ ─────────────────    │
│                                 │  │ 영업일지 — 준비중(비활성)│
└─────────────────────────────────┘  └──────────────────────┘
```

- 우측 패널 sticky = 슬라이스1 레이아웃의 `overflow-y-auto` 스크롤 컨테이너 기준 `sticky top-0`.
- 견적 없음: 히어로는 회사명+상태배지(견적 스탯 숨김), 좌측만(신청기업·설문·사진+CTA), 우측 패널 숨김.

---

## 검증 (Verification)

- 게이트: shared·web test·typecheck·lint·build·e2e·`as any` 0. DB 변경 없음 → 마이그레이션/db-tests 변경 없음(회귀 확인용 실행만).
- 단위(Vitest): `matchEquipmentName`(매칭/부분/공백/대소문자/미매칭), `computeQuoteValidity` 15일 갱신, 소계 합산.
- e2e: 의뢰 상세 진입 → 히어로·버전이력·신청기업·선택장비·SUMMARY 렌더. `?v=` 버전 전환. 견적 없는 의뢰 = 폴백+CTA. 슬라이스2 e2e(app-status·발행 흐름)는 새 구조에 맞춰 셀렉터 갱신(배지 testid 유지).
- 시각(browse): 발행견적(이미지 매칭 O/X)·임시견적·견적없음 3상태 스크린샷.
- ⚠️ 슬라이스2 배너 흡수 → 슬라이스2 e2e의 배너 단언은 히어로 4스탯/SUMMARY 단언으로 이전.

---

## 위험 (Risks)

| 위험 | 완화 |
|---|---|
| 이름 매칭 실패율(견적 item 이름이 카탈로그와 불일치) | best-effort: 미매칭은 텍스트 라인 폴백(깨지지 않음). 후속 슬라이스에서 equipment_id 영속으로 정확화. |
| page.tsx 비대화 | 컴포넌트 분리(quote-frame/). 데이터 페치만 page, 표시는 컴포넌트. |
| 슬라이스2 e2e 회귀(상단바·배너 제거) | e2e를 새 구조로 갱신, app-status 배지 testid는 히어로에 유지. |
| `?v=` 권한/소속 검증 누락 | quoteId가 해당 application 소속인지 확인(아니면 최신 폴백). RLS는 기존 quotes_select 그대로. |
| 유효기간 15일 변경이 슬라이스2 테스트 깨뜨림 | banner.test.ts를 15일 기준으로 동시 갱신. |
| 견적서 출력(PDF) 버튼 — 미발행 견적엔 pdf_url 없음 | issued+pdf_url 있을 때만 활성, 아니면 비활성/숨김. |

---

## 산출물

- 신규: `_components/quote-frame/*`(컴포넌트 9~10), `lib/quotes/equipment-match.ts`(+테스트).
- 변경: `applications/[id]/page.tsx`(재구성·분기), `lib/quotes/banner.ts`(유효기간 15일)+`banner.test.ts`, `quotes/[id]/page.tsx`(리다이렉트), e2e(applications·quotes 갱신).
- 디자인 토큰·상태 스파인·DB 스키마 변경 없음.
