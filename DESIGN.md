# Design System — 재현테크 견적관리 (jhtechSaaS)

## Product Context
- **무엇:** (주)재현테크 견적관리 SaaS — 포장기계/스마트제조 B2B 장비 견적·관리.
- **누구:** 내부(영업사원·관리자, 매일 사용) + 외부(견적 요청 고객 업체).
- **공간:** B2B 산업장비 견적 / 경량 ERP.
- **타입:** 내부 도구·대시보드 위주 + 공개 요청 폼.
- **북극성(기억할 한 가지):** **"복잡한 것을 한눈에" — 명료함.** 모든 시각 결정이 이걸 서빈다.

## Aesthetic Direction
- **방향:** Industrial / Utilitarian (clean-minimal) — 2026-06 리디자인(v3)으로 톤을 따뜻한 라이트 인디고로. 명료함은 유지하되 차갑던 느낌을 부드럽게.
- **장식 수준:** minimal — 타이포와 여백이 일한다. 장식 0 (현 174KB admin.html 카오스의 반대).
- **무드:** 정밀하고 신뢰감 있는 업무 도구. 강한 정보 위계. 레퍼런스(ProCore HR·Ventixe)의 라이트 대시보드 톤.

## Typography
- **Display/제목:** Plus Jakarta Sans 600/700(영문·숫자) + Pretendard 600/700(한글)
- **본문/UI:** Plus Jakarta Sans 400/500(영문·숫자) + Pretendard 400/500(한글)
- **데이터/식별자:** Plus Jakarta Sans + `tabular-nums` — 접수번호(REQ-/QT-)·금액·일자. 자릿수 정렬은 `tabular-nums`가 담당(별도 mono 폰트 대신 본문 폰트 통일).
- **로딩:** Plus Jakarta Sans (Google Fonts) + Pretendard (jsdelivr `orioncactus/pretendard`). ※ JetBrains Mono는 리디자인 전 mono 폰트 — 현재 토큰 미사용(legacy).
- **근거:** Plus Jakarta Sans = 레퍼런스 매칭(영문·숫자 기하학적 톤). Pretendard = 한글 UI 표준(Jakarta에 한글 없어 자동 폴백). 숫자 tabular = 스캔 가속·정밀함.
- **스케일(px):** display 28 / h1 22 / h2 18 / body 14 / small 12 / micro 11, line-height 1.5

## Color
- **접근:** restrained + 의미 기반 (색 = 상태 의미, 장식 아님). 2026-06-08 색 재단장: 소프트 인디고 → 딥네이비+스틸블루 모노톤(무채색 베이스).
- **브랜드 액센트:** `#1F3B5C` (스틸블루) — 버튼·active·아이콘칩·배지. ⚠️ 재현테크 브랜드/로고 색 확정 시 이 값만 교체(아직 미확정 placeholder).
  - 보조: accent-2 `#2E4E73`(밝은 스틸 하이라이트) · accent-soft `#E2E8F1`(아이콘칩·active 배경 틴트) · accent-ring `#C3CEDC`(링/테두리)
- **네이비 베이스:** navy `#0B1F3A` · navy-2 `#1F3B5C`(hover/스틸) · navy-3 `#2E4E73`(active) — 사이드바·배너 등 깊은 표면.
- **중립(light·쿨):** bg `#E6E9EF`(라이트 그레이) · sidebar `#0B1F3A`(**다크 네이비 사이드바**, 라이트 글자) · sidebar-text `#A7B1BE`(nav 라벨) · surface `#ffffff`(카드) · surface-2 `#EEF1F6`(트랙·hover) · border `#D6DBE4` · text `#2B2F36`(차콜 본문) · muted `#667285`
- **상태(색 스파인 — 목록·상세·배지):** 신규 `#2563EB` · 배정 `#7C3AED` · 견적중 `#D97706` · 발송완료 `#16A34A` · 실패 `#DC2626` (각 soft 배경 포함). 리디자인에서 **변경 없음** — 스파인은 의미 색이라 유지.
  - **A/S status (P-D, 스파인 재사용):** 접수 `#2563EB`(=신규) · 진행중 `#D97706`(=견적중) · 보류 `#64748B`(슬레이트=멈춤/중립) · 완료 `#16A34A`(=발송완료) · 취소 `#DC2626`(=실패). 색 언어 일관: blue=유입, amber=진행, green=성공종결, red=부정종결, slate=멈춤.
- **대시보드 도넛 파스텔(표현 전용):** 전체현황 도넛 차트에 한해 스파인을 파스텔로 오버레이 — 접수/신규 `#9db8f2` · 배정 `#c3acef` · 견적중/진행중 `#f4cf99` · 완료 `#9bd9ae` · 보류 `#c1c8d6` · 취소 `#f2a6a6`. 목록·배지의 캐노니컬 스파인은 그대로(도넛만 부드러운 톤).
- **장비 active/inactive:** 운영중 `#16a34a` · 비활성 `#64748b`(=muted) · 에러 `#dc2626`.
- **다크 모드:** surface 재설계 필요. v1 우선순위 낮음(desktop 주간 사용).

## Spacing
- **베이스:** 4px
- **밀도:** hybrid — 폼 comfortable, 테이블 행 compact(40px)
- **스케일:** 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48

## Layout
- **접근:** hybrid — 콘솔/테이블 grid-disciplined, 공개 폼 mobile-first 단일 컬럼
- **콘솔(v3):** 좌측 **다크 사이드바(224px, bg `#0B1F3A`, 라이트 글자)** — 로고+nav(아이콘+라벨+배지), 하단 프로필 블록, 우측 보더. nav 라벨 `sidebar-text`(`#A7B1BE`), active nav 항목=`bg navy-2`(스틸블루) 배경+흰 글자. + 상단바(검색 + 알림벨(배지) + 아바타) + 본문.
- **공개 포털(고객센터):** 라우트 그룹 `app/(portal)/`이 모든 공개 페이지(홈·카탈로그·상세·견적·A/S·소모품)에 공통 셸 적용 — **상단바(워드마크 + 데스크톱 메뉴 견적·A/S·소모품, active=accent-soft+accent)** + **모바일 하단 고정 탭바(아이콘+짧은 라벨 3탭, `md:hidden`, 본문 `pb-16`으로 가림 방지)** + 푸터(회사·연락처). 홈=히어로+아이콘 3카드+이용안내 3단계. nav/탭=짧은 라벨, 홈 카드=풀네임(접근명 분리, E2E 중복 회피). /login·/admin은 포털 밖.
- **대시보드:** 3열 — 좌(액션큐+전체현황 도넛) / 우 레일(이번 달 캘린더 + 신청 리스트). `xl:grid-cols-[1fr_340px]`.
- **최대 콘텐츠 폭:** 1320px (콘솔 본문)
- **Border radius:** sm 4 / md 8 / lg 12 / 카드 2xl(16) / full 9999
- **Elevation(그림자):** 카드는 옅은 그림자로 배경에서 분리(떠 보이게). 검정 대신 본문 네이비(`#2a2840`)를 옅게 깐 톤 → `shadow-card`(기본) / `hover:shadow-card-hover`(인터랙티브 카드). 공개 페이지(카탈로그·상세·신청)는 흰 카드(`surface`)+보더+`shadow-card`로 항목을 박스 단위 분리. 콘솔은 surface↔bg 대비 위주(그림자 절제).
- **반응형:** 폼 = mobile-first, 콘솔 = desktop-primary(좁으면 카드뷰 전환)

## Motion
- **접근:** minimal-functional
- **이징:** enter ease-out / exit ease-in / move ease-in-out
- **지속:** micro 50-100ms / short 150-250ms / medium 250-400ms
- 비동기 작업(PDF/메일) 상태 전환만 의미 있는 모션. 장식 모션 0.

## Risks Adopted (제품의 얼굴)
1. **상태를 1급 색 스파인으로** — 목록·상세·이력 전반 일관된 색 언어.
2. **모든 식별자·숫자 tabular-nums** — 정밀한 "계기판" 느낌, 숫자 스캔 가속(폰트는 본문과 통일, 정렬은 tabular).
3. **액센트 소프트 인디고(v3)** — 라이트 대시보드 톤. 차가운 딥틸에서 따뜻한 인디고로 전환(2026-06 리디자인).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-28 | 디자인 시스템 생성 (industrial-clean, 북극성=명료함) | /design-consultation. 데이터 밀집 B2B 내부 도구. 프리뷰: `~/.gstack/projects/jhtechSaaS/designs/design-system-20260528/design-preview.html` |
| 2026-06-02 | A/S status 5종 색 매핑(P-D) — 접수=신규블루·진행중=견적앰버·보류=슬레이트회색·완료=발송그린·취소=실패레드 | 색 스파인 재사용으로 도메인 넘는 색 언어 일관(Risk #1). 보류만 신규(멈춤=중립 회색). autoplan Design 리뷰 권고. |
| 2026-06-05 | **콘솔 UI 리디자인(v3)** — 폰트 Plus Jakarta Sans(영문/숫자)+Pretendard(한글), 액센트 딥틸 `#155E75`→소프트 인디고 `#6360c4`, 사이드바 196px 네이비→224px 라이트 `#e7e9f3`, 본문폭 1140→1320, 전체현황 색바→파스텔 도넛, 우측 캘린더 레일 | Seonje님 승인(레퍼런스 ProCore HR·Ventixe). 상태 스파인은 의미 색이라 불변. 브랜드색 미확정이라 인디고는 placeholder. v0.12.1.0(PR #49). |
| 2026-06-05 | **공개 페이지 카드화(elevation 도입)** — 카탈로그·상세·신청을 흰 카드(`surface`)+보더+옅은 그림자(`shadow-card`)로 항목 박스 분리. 카탈로그 카드 `bg-bg`(배경동색=묻힘) 버그 수정. 카드 radius 2xl(16) 통일, 그림자는 네이비 틴트 | Seonje님 요청("둥둥 떠있는 박스처럼 항목 구분"). '옅은 그림자' 선택(미니멀 톤 유지). 상태 스파인 불변. |
| 2026-06-05 | **고객 포털 셸 도입** — 공개 페이지를 라우트 그룹 `(portal)`로 묶고 상단바+모바일 하단탭+푸터 공통 적용. 홈=히어로+아이콘 3카드+이용안내. 인라인 SVG 아이콘(견적=문서·A/S=렌치·소모품=박스). | Seonje님 요청("단순 신청이 아닌 고객 포털 느낌, 모바일 친화"). 상단바+하단탭 선택. v3 색 유지(새 색 0). 전화번호 placeholder. |
| 2026-06-08 | **콘솔 색 재단장** — v3 소프트 인디고 → 딥네이비+스틸블루 모노톤(팔레트 #0B1F3A·#1F3B5C·#A7B1BE·#E6E9EF·#2B2F36), 사이드바 라이트→다크 반전, accent 모노톤(스틸블루). 상태 스파인 불변. | Seonje님 승인(새 팔레트 이미지). 토큰 값 교체+사이드바 반전. globals.css `--color-accent` 등 한 곳에서 관리. |
