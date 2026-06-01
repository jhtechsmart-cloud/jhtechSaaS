# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/)(4자리 MAJOR.MINOR.PATCH.MICRO).

## [0.3.1.0] - 2026-06-01

### Added
- **M2 P-A1 견적요청 v2 — 데이터 기반 + 운영자 입력 UI** (GitHub #19a) — M2 고객 포털의 첫 단계. 공개 흐름(P-A2) 전에 데이터 토대를 깐다.
  - 장비 사양을 평면 `{label,value}` → **아이콘 그룹 구조**(`{group,icon,items[]}`, 9종 고정 아이콘 enum)로 확장. 기존 평면 데이터는 단일 기본그룹으로 자동 마이그레이션 + 하위호환 파서.
  - `equipment`에 **요약(highlights) 불릿**·**복수 제품영상(youtube_urls)** 추가. 공개 뷰 재생성(가격·옵션 비노출 유지).
  - `applications`에 **개인정보 동의 3컬럼**(동의·시각·버전) + **equipment_id FK** 추가. 기존 `fields.equipment_id` 백필.
  - **`privacy_policies`** 버전 테이블(v1.0 플레이스홀더) + RLS. **`customer-uploads`** 비공개 버킷(현장 사진, anon 업로드·스태프 열람, 경로 형식 강제).
  - **견적요청 RPC v2**: 개인정보 동의(엄격 boolean·실재 버전 검증)·선택 장비(active 검증)·현장 사진 경로·사업자번호 국세청 체크섬을 서버에서 강제. `status='new'`·미배정 하드코딩 유지(익명 위조 차단).
  - **운영자 장비 폼 확장**: highlights·복수 youtube·그룹 사양(아이콘 드롭다운, 중첩 편집) 입력.
  - 사업자등록번호 체크섬 순수함수(`validateBizNo`) 추가(클라+서버 공유, P-A2 폼에서 배선 예정).
- **M2 고객 포털 마일스톤 등록** — 설계문서·로드맵(roadmap.json/ROADMAP.md)·프로젝트 지도에 M2(P-A~P-G) 반영.

## [0.3.0.0] - 2026-05-31

### Added
- **E3 공개 장비 카탈로그·상세 + 견적요청 폼** (GitHub #4) — 비로그인 고객이 장비를 둘러보고 견적을 요청.
  - 공개 카탈로그 `/equipment`: active 장비 목록(반응형 그리드, 대표사진·이름·모델·카테고리). `equipment_public` 뷰 경유로 가격·옵션 영구 비노출, inactive 비노출.
  - 장비 상세 `/equipment/[id]`: 사진 갤러리 · 사양 테이블 · YouTube 임베드(nocookie). 동적 SSR로 admin 수정 즉시 반영. 잘못된/inactive id는 404(not-found).
  - 견적요청 폼 `/request`: react-hook-form + zod, 상세에서 장비 사전선택(`?equipment=`). 회사명·대표·사업자번호·연락처·이메일·주소 + 요청사항. 제출 시 접수번호(`REQ-…`) 확인. 기존 `quote.html`의 silent-fail 버그 제거(저장 실패 시 명시적 통지).
  - 접수완료 `/request/success`: 접수번호 표시 + 위조·직접진입 방지(형식 검증 후 미달 시 카탈로그로).
  - SEO: 동적 `sitemap.xml`(active 장비 포함) · `robots.txt`(admin disallow) · 상세 `generateMetadata`(OpenGraph) · 루트 title template.
  - 미니멀 홈 `/` + 재사용 카탈로그 버튼.
  - `submit_application(payload jsonb)` SECURITY DEFINER RPC — anon 견적요청 저장 + 접수번호 반환(anon SELECT 금지 우회). `status='new'`·미배정 서버 강제, 입력 길이 캡.

### Changed
- `applications` 컬럼 길이 CHECK 제약 추가 — anon이 공개 키로 REST에 직접 INSERT해 RPC 길이 캡을 우회하는 경로를 DB 레벨에서 차단.

## [0.2.0.0] - 2026-05-30

### Added
- **E2 장비·옵션 관리 admin** (GitHub #3) — 영업/관리자가 웹에서 장비 카탈로그를 생성·조회·수정·삭제.
  - 웹 인증 토대: `@supabase/ssr` 쿠키 세션, `proxy.ts` 라우트 가드(미인증 → `/login`), 이메일·비번 로그인/로그아웃, admin 콘솔 셸(권한 없으면 403). E4 콘솔에서 재사용.
  - 장비 목록 `/admin/equipment`: 서버 읽기 + 클라 검색·상태 필터·카드뷰 + 5-state(로딩/빈/에러/조회/부분).
  - 장비 폼(생성·수정): react-hook-form + zod 공유 스키마. 사양·옵션·이미지 리치 에디터 포함.
  - 사양 에디터: `{항목, 값}` 행 추가·삭제·순서변경(↑↓ 버튼 + 드래그), jsonb 순서 보존.
  - 옵션 에디터: 포함/추가(included/extra) 옵션 행 인라인 편집.
  - 이미지 업로더: 브라우저에서 Storage로 직접 업로드(다중·드래그 순서·대표 지정·삭제 동기). 저장 실패·취소 시 이번 세션 업로드분을 best-effort 정리.
  - 쓰기 = Server Actions(권한 3중 가드: proxy + layout + 액션 재검증, RLS 최종 강제), 옵션은 replace 전략.
  - 첫 Playwright E2E 도입: 미인증 리다이렉트·생성 플로우·inactive 토글(로컬 Supabase 기반).
  - DESIGN.md 디자인 토큰을 globals.css `@theme`로 확립(Pretendard · JetBrains Mono · deep teal accent).

### Changed
- `Equipment.specs`를 자유형 객체에서 `Spec[]`(항목+값 배열)로 구체화 + jsonb 직렬화/역직렬화 방어 헬퍼.
- `equipment-images` 버킷에 서버측 업로드 제한(5MB · jpg/png/webp) 적용 — 클라이언트 검증 우회 차단(AC4 서버 강제).

### Fixed
- 리뷰 보강: `youtube_url`을 YouTube 호스트로 제한(`javascript:`/`data:` 등 위험 스킴 차단), `photos` 경로 형식 강제(타 장비 객체 삭제·경로조작 방지), update/delete 0행 감지 + id UUID 검증, 생성 원자성(옵션 저장 실패 시 보상 삭제), DB 에러 메시지 일반화(스키마 노출 방지).

## [0.1.0.1] - 2026-05-29

### Fixed
- seed-admin 프로덕션 비밀번호 가드 — 비로컬(프로덕션) 시드는 `SEED_*_PASSWORD` env(≥16자) 필수, 약한 dev 기본 비번 사용 차단. 개발 전용 계정은 프로덕션 시드에서 제외. (코드리뷰 후속 보안 보완)

## [0.1.0.0] - 2026-05-29

### Added
- **E1 Foundation** — 견적관리 시스템의 단일테넌트 Postgres 토대(GitHub #2).
  - 6개 도메인 테이블(profiles·equipment·equipment_option·applications·quotes·email_log) 마이그레이션 + 전 테이블 RLS.
  - capability 권한 모델: `profiles.permissions[]` + 코드 registry(6키) + `has_permission()`(SECURITY DEFINER, InitPlan 래핑) RLS 헬퍼.
  - Supabase Auth 연동: `auth.users` INSERT 트리거로 profiles 자동 생성, service_role 부트스트랩 시드(개발 관리자·영업 계정).
  - 공개 장비 카탈로그: `equipment_public` 뷰(가격·옵션 비노출, active만)로 비로그인 고객에게 사진·스펙·YouTube 노출.
  - 공개 견적요청 폼 기반: `applications` anon INSERT(WITH CHECK status='new', 미배정) + 서버 생성 접수번호 `REQ-YYYYMMDD-NNNNN`(KST, 전역 sequence).
  - Storage 버킷: `equipment-images`(public) + `quote-pdfs`(private, 서명 URL).
  - `@jhtechsaas/shared` 패키지: permission registry + `can()` 헬퍼, Supabase 클라이언트 팩토리(anon/service_role 분리), 도메인 타입.
  - RLS 통합 테스트 하니스(`@jhtechsaas/db-tests`, `set role`+JWT) — 47 RLS + 10 단위 테스트.
  - 마이그레이션별 롤백 스크립트.
