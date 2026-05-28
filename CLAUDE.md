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
