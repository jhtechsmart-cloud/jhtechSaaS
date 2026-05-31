# UI-SPEC — 화면 레벨 디자인 계약 (jhtechSaaS)

화면별 레이아웃·상태·반응형·컴포넌트 해부 계약. 시스템 토큰(폰트·색·간격·모션)은 `DESIGN.md`가 단일 출처 — 여기서 재정의하지 않고 **참조만** 한다. 이 문서는 planner/TDD가 직접 소비하는 게이트 산출물이다.

- 북극성(상속): **"복잡한 것을 한눈에" — 명료함.**
- 토큰 참조: `DESIGN.md` (Pretendard UI / JetBrains Mono tabular = 식별자·숫자·금액 / deep teal `#155E75` accent / 4px 베이스 / radius sm4·md8·lg12 / 모션 micro·short).
- 5-state 정의(전 화면 공통): **loading / empty / error / populated / partial**.
  - `partial` = "데이터·작업이 부분만 있는" 상태. 화면마다 의미가 다름(필터 0건, 저장 중, 일부 업로드 완료 등) — 각 화면에서 구체화.

---

## E2 — 장비·옵션 관리 admin

대상 화면 3개(이슈 #3 게이트): **① 목록** `/admin/equipment` · **② 폼(생성/수정)** `/admin/equipment/new`·`/[id]/edit` · **③ 이미지 업로더**(폼 내장, 게이트가 별도 명세 요구).

### 0. 공통 셸 (콘솔)

DESIGN.md "콘솔" 레이아웃 그대로:

```
┌────────┬──────────────────────────────────────────────┐
│ 사이드  │  상단 툴바 (검색 · 상태 필터 · [+ 새 장비])      │
│ 196px  ├──────────────────────────────────────────────┤
│        │                                              │
│ 메뉴   │   콘텐츠 (max 1140px, 좌측 정렬)               │
│        │                                              │
└────────┴──────────────────────────────────────────────┘
```

- 사이드바 196px 고정. 현 E2 메뉴 항목: **장비** (활성). 다른 항목은 E4에서 추가 — E2에선 단일 항목이라도 셸은 콘솔 구조 유지(E4 재사용).
- 콘텐츠 max-width 1140px. 베이스 간격 4px 스케일(2/4/8/12/16/24/32/48).
- 인증 가드(이슈 #3 A): 미인증 → `/login`, `equipment.manage` 없으면 셸 자체를 403(목록 미노출).

#### 장비 status 배지 — 도출 결정 ⚠️ (DESIGN.md 미명문, 확인 필요)

DESIGN.md의 5색 상태 스파인(신규/배정/견적중/발송완료/실패)은 **신청 워크플로**용. 장비 status는 이슈 #3 AC5 기준 **active/inactive 2상태**라 별도 매핑:

| status | 라벨 | 색 | 의미 |
|---|---|---|---|
| `active` | 운영중 | `#16A34A` (발송완료 green + soft 배경) | 공개(`equipment_public`) 노출 대상 |
| `inactive` | 비활성 | muted `#64748B` (중립 회색 + surface-2 배경) | 뷰에서 제외, 가격·옵션 비노출 |

→ 색=의미 원칙 유지. green을 "운영중"에 재사용해도 신청 스파인과 맥락이 달라 충돌 없음. **확인 포인트:** 이 2색 매핑 OK?

---

### 1. 목록 화면 `/admin/equipment`

#### 레이아웃
- 툴바: 좌측 **검색 인풋**(name·model 부분일치) + **상태 필터**(전체 / 운영중 / 비활성 세그먼트) · 우측 **[+ 새 장비]** primary 버튼(deep teal).
- 본문: 밀집 데이터 테이블. **행 높이 40px(compact)**. 행 클릭 → `/[id]/edit`.

#### 컬럼
| 컬럼 | 정렬 | 타이포 | 비고 |
|---|---|---|---|
| 대표사진 | 좌 | — | 40×40 thumbnail(radius sm4), 없으면 placeholder 아이콘 |
| name | 좌 | Pretendard 500 | 주 식별, 줄바꿈 금지(ellipsis) |
| model | 좌 | **JetBrains Mono** | 모델 코드 = 식별자 → mono |
| category | 좌 | Pretendard 400 | muted |
| base_price | **우** | **JetBrains Mono tabular** | `₩` + 천단위 콤마, 우측 정렬(금액 스캔) |
| status | 좌 | 배지 | 위 2색 매핑 |

기본 정렬: 최신 생성순(created_at desc). 헤더 클릭 정렬은 E2 비범위(필요 시 후속).

#### 5-state
| state | 표현 |
|---|---|
| **loading** | 테이블 스켈레톤 5~6행(shimmer, short 모션). 툴바는 즉시 렌더(필터 disabled). |
| **empty** | (데이터 0건, 첫 사용) 중앙 빈 상태: "등록된 장비가 없습니다" + 부연 "첫 장비를 추가해 카탈로그를 시작하세요" + **[+ 새 장비]** CTA. |
| **error** | 테이블 영역에 인라인 에러 카드: "목록을 불러오지 못했습니다" + `[다시 시도]`. 툴바 유지. error 색 `#DC2626` soft. |
| **populated** | 전체 테이블. 행 hover = surface-2 배경. |
| **partial** | (데이터는 있으나 **검색·필터 결과 0건**) "조건에 맞는 장비가 없습니다" + `[필터 초기화]`. empty와 구분(카탈로그는 비어있지 않음). |

#### 반응형 (admin=desktop-primary)
- 기본(데스크톱): 위 테이블.
- 좁은 폭(< 768px): DESIGN.md "좁으면 카드뷰 전환" — 행 → 카드(대표사진 좌측 64×64 + name/model/price 스택 + status 배지 우상단). 사이드바는 상단 햄버거로 접힘.
- 폼/목록 모두 desktop 우선이라 모바일은 "동작은 하되 최적화 아님" 수준(이슈 #3 D3: 공개 반응형은 E3).

---

### 2. 폼 화면 (생성/수정) `/admin/equipment/new` · `/[id]/edit`

#### 레이아웃
- 단일 컬럼, 콘텐츠 max 720px(폼은 comfortable 밀도, 1140px 다 안 씀). 섹션 카드로 그룹.
- 상단: 페이지 타이틀("장비 추가" / "장비 수정") + 우측 **sticky 액션 바**(저장 primary / 취소 ghost). 저장 중 버튼 spinner+disabled.
- **id 클라 생성**(`crypto.randomUUID()`)로 먼저 확정 → 이미지 경로 `equipment/{id}/…` 안정화(이슈 #3 B).

#### 섹션
1. **기본 정보** (comfortable): `name`(필수) · `model`(mono 인풋) · `category` · `base_price`(mono tabular 인풋, ₩ 프리픽스, 숫자만) · `status` 토글(운영중/비활성) · `youtube_url`(URL 검증).
2. **사양 (SpecEditor)**: `{label, value}` 행. `[+ 항목 추가]`로 행 추가, 행별 삭제, 드래그 순서(jsonb 순서 보존, AC6). 빈 행 저장 시 제외. label/value 둘 다 텍스트 인풋.
3. **이미지 (ImageUploader)**: 섹션 3 별도 명세(아래 #3).
4. **옵션 (OptionEditor)**: `equipment_option` 인라인 행 — `kind`(included/extra 세그먼트) · `name` · `price`(mono tabular). `[+ 옵션 추가]` / 행 삭제(AC7).

#### 검증 / 에러 (inline)
- `name` 빈값 → "장비명을 입력하세요".
- `base_price` 음수/비숫자 → "올바른 금액을 입력하세요".
- `youtube_url` 형식 오류 → "유효한 YouTube 링크가 아닙니다"(선택값, 빈값 허용).
- 이미지 >5MB / 비허용 형식 → 업로더 내 처리(#3).
- 필드 에러는 해당 인풋 하단 micro(11px) error 색. 저장 시 첫 에러 필드로 스크롤·포커스.

#### 5-state
| state | 표현 |
|---|---|
| **loading** | (수정 모드, 기존 데이터 fetch) 섹션 스켈레톤(필드 placeholder bar). |
| **empty** | (생성 모드) 빈 폼 + 기본값(status=운영중, specs 1 빈 행, 옵션 0행, 이미지 0). |
| **error** | 저장 실패 시 폼 상단 에러 배너("저장하지 못했습니다: {사유}") + 필드별 inline 에러. 서버/RLS 거부(권한) → "권한이 없습니다"(403 안내). |
| **populated** | (수정 모드 로드 완료 / 유효 입력) 정상. |
| **partial** | (a) **저장 중**: 액션 바 spinner, 폼 disabled. (b) **dirty(미저장 변경)**: 이탈 시 "변경사항이 저장되지 않았습니다" 확인. (c) 이미지 일부 업로드 진행 중 → 저장 버튼 "업로드 완료 후 저장" 가드. |

#### 반응형
- 데스크톱: 단일 컬럼 720px, sticky 액션 바.
- 좁은 폭: 섹션 카드 풀폭, 액션 바 하단 고정 바로 전환. SpecEditor/OptionEditor 행은 입력 스택(라벨 위, 값 아래).

---

### 3. 이미지 업로더 (ImageUploader) — 폼 내장 컴포넌트

이슈 #3 D4·AC4: 다중·드래그 순서·대표(첫 장)·삭제 시 Storage·DB 동기. 경로 `equipment/{id}/{uuid}.{ext}`, jpg/png/webp ~5MB.

#### 해부
```
┌─────────────────────────────────────────────┐
│  ⬆ 이미지를 끌어다 놓거나 클릭해서 선택        │  ← 드롭존 (점선 border, dashed)
│     jpg · png · webp · 최대 5MB               │
└─────────────────────────────────────────────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ [대표]│ │      │ │      │ │  +   │   ← 썸네일 그리드 (radius sm4)
│ img1 │ │ img2 │ │ img3 │ │ 추가 │      드래그로 순서, 첫 장 = 대표 배지
│   ✕  │ │   ✕  │ │   ✕  │ └──────┘      hover 시 ✕ 삭제
└──────┘ └──────┘ └──────┘
```
- 썸네일 96×96. 첫 장에 **[대표]** 배지(deep teal). 드래그로 순서 변경 → `photos[]` 순서 = DB 순서(AC4).
- 삭제 ✕ → 확인 후 Storage 객체 + DB 동기 제거(고아 방지, 이슈 #3 Rollback).

#### 5-state
| state | 표현 |
|---|---|
| **loading** | 업로드 진행 중 썸네일에 progress(원형 또는 바). 다중 동시 업로드 각각 표시. |
| **empty** | 드롭존만(썸네일 0). "이미지를 끌어다 놓거나 클릭". |
| **error** | 거부 파일 → inline 에러 칩("img4.gif: 지원하지 않는 형식", "img5.png: 5MB 초과"). **부분 성공 허용**(유효분은 업로드, 거부분만 에러). error 색. |
| **populated** | 썸네일 그리드 + 대표 배지 + 순서. |
| **partial** | **일부 완료·일부 진행 중**(혼합) — 완료 썸네일 + 진행 중 progress 공존. 이 동안 폼 저장은 "업로드 완료 후" 가드(폼 partial-c 연동). |

#### 반응형
- 데스크톱: 썸네일 4열.
- 좁은 폭: 2열, 드롭존 풀폭.

---

### 컴포넌트 인벤토리 (이슈 #3 Files Reference 정합)

| 컴포넌트/파일 | 화면 | 핵심 |
|---|---|---|
| `app/admin/equipment/page.tsx` | 목록 | 테이블·툴바·5-state |
| `app/admin/equipment/new`·`[id]/edit` | 폼 | 섹션·검증·5-state |
| `components/equipment/SpecEditor.tsx` | 폼§2 | `{label,value}[]` 행, 순서 |
| `components/equipment/ImageUploader.tsx` | 폼§3 | 다중·순서·대표·삭제 |
| `components/equipment/OptionEditor.tsx` | 폼§4 | included/extra 인라인 |
| (공통) 콘솔 셸 | 전체 | 사이드바196·툴바 (E4 재사용) |

### 접근성 / 마이크로카피
- 모든 인터랙티브 요소 키보드 접근(드래그 순서는 ↑↓ 버튼 대체 제공 — 드래그 only 금지).
- 라벨 한국어, 명료 우선(북극성). 에러는 "무엇을·어떻게" 한 줄.
- status 배지 = 색 + **텍스트 라벨 병기**(색맹 안전).
- 금액·model = mono tabular로 스캔성 확보.

### E2 비범위 (UI 관점)
- 공개 `/equipment/[id]` 상세·SEO·완전 반응형 → E3.
- 다크 모드 → v1 우선순위 낮음(DESIGN.md).
- 헤더 정렬·페이지네이션·벌크 액션 → 후속(데이터량 적은 초기엔 불필요).

### 확정 결정 (2026-05-30 승인)
1. ✅ **장비 status 2색 매핑** — 운영중 green `#16A34A`(soft) / 비활성 muted `#64748B`. 텍스트 라벨 병기.
2. ✅ **목록 = 전량 로드**(페이지네이션 없음). 클라이언트 검색·필터. 데이터 증가 시 후속에서 서버 페이지네이션.
3. ✅ **사양·옵션 순서 = 드래그 + ↑↓ 버튼 병행**(드래그 only 금지, 키보드·접근성).

---

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

---

## E3 P2 — 견적요청 폼

### `/request` (견적요청)
- **레이아웃**: `max-w-2xl` 중앙. 헤더(견적 요청 + 안내문) → 선택장비 칩(있을 때) → 입력 그리드 → 제출 버튼.
- **입력 그리드**: 모바일 1열 / `sm` 이상 2열. 코어 6필드(회사명·대표자명·사업자등록번호·연락처·이메일·주소) + 요청사항(textarea, 전폭).
- **필수**: 코어 6필드 모두 필수, 요청사항 선택. 사업자번호·연락처는 `font-mono`(DESIGN.md: 식별자=mono).
- **5-state**: 기본(빈 폼) / 입력중 / 검증에러(필드별 `text-danger` 인라인) / 제출중(버튼 `제출 중…`·비활성) / 서버에러(폼 하단 `text-danger`).
- **선택장비**: `?equipment=[id]`가 active면 상단에 읽기전용 칩(장비명 mono), inactive·없으면 칩 생략(일반 문의).

### `/request/success` (접수완료)
- **레이아웃**: `max-w-lg` 중앙정렬. 완료 헤드라인 → 안내문 → 접수번호 카드(`font-mono text-h1`) → 카탈로그 링크.
- **가드**: `?no` 없이 진입 시 `/equipment` redirect.

### CTA 배선
- 상세(`/equipment/[id]`) "이 장비로 견적 요청" → `/request?equipment=[id]` (P1에서 이미 배선, P2 라우트로 정상화).

---

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-30 | E2 장비 admin UI-SPEC 작성 | 게이트(이슈 #3). DESIGN.md 시스템 토큰 상속, 화면 레벨 계약만. `/gsd-ui-phase`(GSD 인프라 없음)·`/design-consultation`(시스템 이미 완성) 대신 텍스트 계약 직접 작성. |
