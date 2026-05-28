# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

(주)재현테크 SaaS 신규 프로젝트. `jhtechsmart`(정적 HTML + GAS + Google Sheets 스택)의 후속 또는 재구성 버전으로, Supabase 기반 아키텍처를 전제로 한다.

관련 프로젝트:
- `../jhtechsmart` — 현 운영 시스템 (건드리지 않음)
- `../jhtechsmart-dev` — Supabase 마이그레이션 테스트 환경
- `../migration-plan.md` — 마이그레이션 전체 계획

## 커밋 컨벤션

한국어 Conventional Commits 스타일:
- `feat:` / `fix:` / `chore:` / `docs:` / `config:` 접두사
- 예: `feat: 신청 목록 자동 갱신 추가`

## 작업 원칙

- 코드·에러·DB 설정에 근거 없이 추측으로 수정하거나 응답하지 않는다.
- 이 프로젝트는 초기 단계 — 아키텍처 결정 전에 사용자에게 확인한다.

## Design System

UI·시각 결정 전에 항상 `DESIGN.md`를 먼저 읽는다. 폰트·색·간격·레이아웃·미학 방향이 거기 정의돼 있다.
사용자 명시 승인 없이 벗어나지 않는다. QA 시 DESIGN.md와 어긋나는 코드를 플래그한다.
북극성: "복잡한 것을 한눈에"(명료함). 상태 = 색 스파인, 숫자·식별자 = mono tabular.

## 아키텍처 전제 (글로벌 CLAUDE.md 일부 override)

이 프로젝트는 **단일 테넌트(jhtech 전용)**다. 글로벌의 멀티테넌트 규칙을 아래로 대체한다:
- 글로벌 "모든 도메인 테이블 `tenant_id NOT NULL` 필수 / `tenant_id` 기반 RLS만" → **적용 안 함** (단일테넌트라 tenant_id 없음). 사용자 결정: "bpk는 항목이 달라 같이 못 담음".
- 권한 = **capability**: `profiles.permissions text[]` + 코드 permission registry + `has_permission()`(SECURITY DEFINER, `search_path=''`, 정책은 `(select has_permission(...))` InitPlan 래핑) 기반 RLS.
- row scope = `assignee_id = auth.uid() OR has_permission('applications.view_all')` (명문화 안 하면 RLS가 "로그인=전체열람"이 됨).
- service_role 서버/워커 전용은 글로벌 그대로. RLS는 여전히 모든 도메인 테이블 필수.
- 아키텍처 B: Next.js(Vercel) + Supabase(DB/Auth/Storage) + Railway 워커(통합 PDF·메일 = `jobs` 큐 테이블 + `FOR UPDATE SKIP LOCKED` 폴링, webhook/Realtime 회피).
- 견적 버전 = `MAX(version)` + `UNIQUE(application_id, version)`. seq_no = Postgres sequence.
- 상세 설계: GitHub EPIC #1 코멘트 / `~/.gstack/projects/jhtechSaaS/main-autoplan-review-20260528-173317.md`.

## 산출물 위치 · 작업법

- 계획 산출물(design doc·spec·autoplan 리뷰)은 **프로젝트 폴더 밖** `~/.gstack/projects/jhtechSaaS/`. 세션 간 기억은 `~/.claude/.../memory/jhtechsaas-project.md`. 백로그는 GitHub 이슈 #1~#8.
- 프로젝트 문서: `DESIGN.md`(디자인 시스템), `PROJECT-MAP.html`(구조 지도 — `/map`으로 갱신), `dev-notes/`(개발 일지 — `/devnote`).
- git: repo = `jhtechsmart-cloud/jhtechSaaS`. **push는 SSH alias `github-jhtech`** 라 계정 전환 불필요. `gh` CLI(issue/PR)는 active 계정을 `jhtechsmart-cloud`로 두고 사용(개인 `koreakingLab`과 분리).
- codex는 이 계정에서 gpt-5.4/gpt-5 미지원 → /autoplan dual-voice·/spec 게이트가 자동 스킵됨(정상).
