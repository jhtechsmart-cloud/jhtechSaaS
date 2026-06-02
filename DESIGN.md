# Design System — 재현테크 견적관리 (jhtechSaaS)

## Product Context
- **무엇:** (주)재현테크 견적관리 SaaS — 포장기계/스마트제조 B2B 장비 견적·관리.
- **누구:** 내부(영업사원·관리자, 매일 사용) + 외부(견적 요청 고객 업체).
- **공간:** B2B 산업장비 견적 / 경량 ERP.
- **타입:** 내부 도구·대시보드 위주 + 공개 요청 폼.
- **북극성(기억할 한 가지):** **"복잡한 것을 한눈에" — 명료함.** 모든 시각 결정이 이걸 서빈다.

## Aesthetic Direction
- **방향:** Industrial / Utilitarian (clean-minimal)
- **장식 수준:** minimal — 타이포와 여백이 일한다. 장식 0 (현 174KB admin.html 카오스의 반대).
- **무드:** 정밀하고 신뢰감 있는 업무 도구. 강한 정보 위계.

## Typography
- **Display/제목:** Pretendard 600/700
- **본문/UI:** Pretendard 400/500
- **데이터/식별자:** JetBrains Mono (tabular-nums) — 접수번호(REQ-/QT-)·금액·일자
- **로딩:** Pretendard (jsdelivr `orioncactus/pretendard`), JetBrains Mono (Google Fonts)
- **근거:** Pretendard = 한글 UI 표준, 한글+라틴 모두 탁월, 이미 jhtechsmart 자산. mono 숫자 = 스캔 가속·정밀함.
- **스케일(px):** display 28 / h1 22 / h2 18 / body 14 / small 12 / micro 11, line-height 1.5

## Color
- **접근:** restrained + 의미 기반 (색 = 상태 의미, 장식 아님)
- **브랜드 액센트:** `#155E75` (deep teal) — SaaS 블루 비껴감, 산업적 신뢰. ⚠️ 재현테크 브랜드/로고 색 확정 시 이 값만 교체.
- **중립(light):** bg `#FFFFFF` · surface `#F8FAFC` · surface-2 `#F1F5F9` · border `#E2E8F0` · text `#0F172A` · muted `#64748B`
- **상태(색 스파인):** 신규 `#2563EB` · 배정 `#7C3AED` · 견적중 `#D97706` · 발송완료 `#16A34A` · 실패 `#DC2626` (각 soft 배경 포함)
  - **A/S status (P-D, 스파인 재사용):** 접수 `#2563EB`(=신규) · 진행중 `#D97706`(=견적중) · 보류 `#64748B`(슬레이트=멈춤/중립) · 완료 `#16A34A`(=발송완료) · 취소 `#DC2626`(=실패). 색 언어 일관: blue=유입, amber=진행, green=성공종결, red=부정종결, slate=멈춤.
- **다크 모드:** surface 재설계, accent `#22D3EE`(밝게), 채도 10~20% 조정. v1 우선순위 낮음(desktop 주간 사용).

## Spacing
- **베이스:** 4px
- **밀도:** hybrid — 폼 comfortable, 테이블 행 compact(40px)
- **스케일:** 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48

## Layout
- **접근:** hybrid — 콘솔/테이블 grid-disciplined, 공개 폼 mobile-first 단일 컬럼
- **콘솔:** 좌측 사이드바(196px) + 상단 툴바(검색 + 상태 필터) + 밀집 데이터 테이블
- **최대 콘텐츠 폭:** 1140px (마케팅성 페이지 없음)
- **Border radius:** sm 4 / md 8 / lg 12 / full 9999
- **반응형:** 폼 = mobile-first, 콘솔 = desktop-primary(좁으면 카드뷰 전환)

## Motion
- **접근:** minimal-functional
- **이징:** enter ease-out / exit ease-in / move ease-in-out
- **지속:** micro 50-100ms / short 150-250ms / medium 250-400ms
- 비동기 작업(PDF/메일) 상태 전환만 의미 있는 모션. 장식 모션 0.

## Risks Adopted (제품의 얼굴)
1. **상태를 1급 색 스파인으로** — 목록·상세·이력 전반 일관된 색 언어.
2. **모든 식별자·숫자 mono+tabular** — 정밀한 "계기판" 느낌, 숫자 스캔 가속.
3. **액센트 deep teal** — "또 하나의 엔터프라이즈 대시보드" 탈피.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-28 | 디자인 시스템 생성 (industrial-clean, 북극성=명료함) | /design-consultation. 데이터 밀집 B2B 내부 도구. 프리뷰: `~/.gstack/projects/jhtechSaaS/designs/design-system-20260528/design-preview.html` |
| 2026-06-02 | A/S status 5종 색 매핑(P-D) — 접수=신규블루·진행중=견적앰버·보류=슬레이트회색·완료=발송그린·취소=실패레드 | 색 스파인 재사용으로 도메인 넘는 색 언어 일관(Risk #1). 보류만 신규(멈춤=중립 회색). autoplan Design 리뷰 권고. |
