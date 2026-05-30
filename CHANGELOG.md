# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/)(4자리 MAJOR.MINOR.PATCH.MICRO).

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
