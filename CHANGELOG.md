# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/)(4자리 MAJOR.MINOR.PATCH.MICRO).

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
