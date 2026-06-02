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


## 응답 스타일 (사용자 맞춤)

- 나는 vibe-coding 개발자다. 실행은 강하지만 아키텍처·전문용어는 약하다.
- 영어 약어/DB 전문용어/패턴 이름을 쓸 때는, 처음 등장하는 곳에서
  반드시 괄호로 쉬운 우리말 풀이를 붙여라.
  예) "RLS(행 단위 접근 규칙)", "diff-upsert(바뀐 것만 골라 저장)"
- 계획·설계 문서를 줄 때는 맨 위에 "한 문장 요약"과
  "이게 왜 필요한지"를 비전문가도 알게 먼저 적어라.
- 자연스러운 한국어로 써라. 영어 직역 말투(예: "~을 가진다", "~되어진다") 금지.
- 표를 쓸 땐 '용어 → 쉬운 말 → 예시' 컬럼을 기본으로 고려하라.
- 어려운 결정을 설명할 땐 비유나 예시를 하나씩 곁들여라.


## 아키텍처 전제 (글로벌 CLAUDE.md 일부 override)

이 프로젝트는 **단일 테넌트(jhtech 전용)**다. 글로벌의 멀티테넌트 규칙을 아래로 대체한다:
- 글로벌 "모든 도메인 테이블 `tenant_id NOT NULL` 필수 / `tenant_id` 기반 RLS만" → **적용 안 함** (단일테넌트라 tenant_id 없음). 사용자 결정: "bpk는 항목이 달라 같이 못 담음".
- 권한 = **capability**: `profiles.permissions text[]` + 코드 permission registry + `has_permission()`(SECURITY DEFINER, `search_path=''`, 정책은 `(select has_permission(...))` InitPlan 래핑) 기반 RLS.
- row scope = `assignee_id = auth.uid() OR has_permission('applications.view_all')` (명문화 안 하면 RLS가 "로그인=전체열람"이 됨).
- service_role 서버/워커 전용은 글로벌 그대로. RLS는 여전히 모든 도메인 테이블 필수.
- 아키텍처 B: Next.js(Vercel) + Supabase(DB/Auth/Storage) + Railway 워커(통합 PDF·메일 = `jobs` 큐 테이블 + `FOR UPDATE SKIP LOCKED` 폴링, webhook/Realtime 회피).
- 견적 버전 = `MAX(version)` + `UNIQUE(application_id, version)`. 채번 `applications.seq_no = REQ-YYYYMMDD-NNNNN` = **KST(Asia/Seoul)** + 전역 Postgres sequence(10만 건 비잘림).
- **RLS 컬럼 불변**: seq_no·created_at 등 서버 통제값은 컬럼 GRANT REVOKE로 못 막음(테이블 GRANT 있으면 무효) → **BEFORE INSERT/UPDATE 트리거로 강제**(service_role도 트리거는 우회 불가). [E1 확립, E3~E7 재사용]
- **RLS 테스트**: vi.mock 불가 → `packages/db-tests`(pg `set role`+`request.jwt.claims`, Supabase 로컬)로 권한별 단언. 순수 로직은 Vitest 단위.
- **자식 테이블 저장 = id 보존 diff-upsert**: company_equipment·향후 consumables·supply_request_items 등 부모에 종속된 자식 행은 폼 저장 시 **삭제·업데이트·신규를 id로 분리**(삭제된 것만 DELETE, 기존 id는 UPDATE, 신규만 INSERT). equipment_option식 `replace`(delete-all-insert) **금지** — 자식 id가 P-D/P-E/P-F의 FK·이력에 참조되므로 매 저장마다 id가 바뀌면 이력이 끊긴다. [P-B 확립, P-C~F 재사용]
- **부분 UNIQUE(`WHERE ...`)는 `ON CONFLICT` arbiter 미작동(42P10)** → 멱등 upsert는 `BEGIN/EXCEPTION WHEN unique_violation` 블록 + 재조회로. capability는 `customers.manage` 등 키만 추가(registry+seed), admin은 `users.manage`로 자동 통과. [P-B]
- **마이그레이션 롤백 위치**: 롤백 스크립트는 **`supabase/rollback/`(단수)** 에 `<timestamp>_<name>_down.sql`로 둔다. ⚠️ `supabase/migrations/` 안에 두면 같은 타임스탬프 파일이 마이그레이션으로 적용돼 방금 변경을 되돌림. (`supabase/rollbacks/` 복수 디렉토리는 P-A1 실수 — 단수로 통합됨.)
- **익명 RPC/anon 정책 = 서버가 모든 값 강제**: SECURITY DEFINER RPC가 동의(엄격 JSON boolean true + `privacy_policies` 버전 exists 대조)·biz_no 체크섬·사진경로 정규식·equipment_id active를 모두 검증, status/assignee 하드코딩. **anon storage INSERT 정책은 `bucket_id`뿐 아니라 `name` 정규식(버킷-상대 `<uuid>/<slot>.ext`)까지** `with check`에 강제(임의경로 무제한 업로드 차단, RPC 경로 정규식과 동일). 클라는 표시·UX만.
- **게이트**: 단계 머지 전 `pnpm --filter @jhtechsaas/shared test`·`web test`·`@jhtechsaas/db-tests test:rls`·`web typecheck`·`lint`·`build`·**`web test:e2e`**·`as any` 0 모두 통과. ⚠️ E2E 누락 시 admin/공개 UI 회귀를 못 잡는다(P-A1 사례). **db-tests 전 `supabase db reset`**(전역 카운트 단언이 seed-local 잔여행에 취약).
- 상세 설계: GitHub EPIC #1 코멘트 / `~/.gstack/projects/jhtechSaaS/main-autoplan-review-20260528-173317.md`.

## 산출물 위치 · 작업법

- 계획 산출물(design doc·spec·autoplan 리뷰)은 **프로젝트 폴더 밖** `~/.gstack/projects/jhtechSaaS/`. 세션 간 기억은 `~/.claude/.../memory/jhtechsaas-project.md`. 백로그는 GitHub 이슈 #1~#8.
- 프로젝트 문서: `DESIGN.md`(디자인 시스템), `PROJECT-MAP.html`(구조 지도 — `/map`으로 갱신), `dev-notes/`(개발 일지 — `/devnote`).
- **로드맵·진행현황**: 단일 원본 = `docs/roadmap.json`(단계 status·기능 status). 거기서 고치고 `pnpm roadmap:sync` 실행 → `docs/ROADMAP.md` 재생성 + **Notion PRD**(page `36d652ff...`)의 라이브영역(진행현황 콜아웃·14표·기능DB) 자동 갱신(멱등). 동기화 엔진은 `~/scripts/claude-notion-sync`(Notion 토큰·@notionhq/client 재사용, 이 머신 전용). **단계(Exx) 머지·배포 시 `roadmap.json`의 해당 phase status를 done으로 바꾸고 sync** → `/eod` 마무리 단계에 포함. Notion 토큰 없는 머신/CI는 `pnpm roadmap:sync --no-notion`(MD만).
- git: repo = `jhtechsmart-cloud/jhtechSaaS`. **push는 SSH alias `github-jhtech`** 라 계정 전환 불필요. `gh` CLI(issue/PR)는 active 계정을 `jhtechsmart-cloud`로 두고 사용(개인 `koreakingLab`과 분리).
- codex는 이 계정에서 gpt-5.4/gpt-5 미지원 → /autoplan dual-voice·/spec 게이트가 자동 스킵됨(정상).
- **원격 DB 적용**: `/ship`은 git(PR)까지만 — DB 반영은 머지 후 `supabase db push`(CLI를 jhtech 계정 로그인 + `supabase link --project-ref <ref>`, ref·계정은 memory 참조). tsx는 `.env` 자동로드 안 함 → 로컬에서 워커 스크립트 실행 시 env 명시 주입(워커 본체는 Railway가 주입).
- **Vercel 배포**: 프로젝트 = `jhtech-saa-s-web`(team `jhtech-s-projects`, 프로덕션 alias `https://jhtech-saa-s-web.vercel.app`). **Root Directory=`apps/web`** 라 `.vercel` 링크는 **repo 루트**에 둔다(apps/web에 두면 경로 중복 에러). env 추가는 에이전트 환경에서 **`vercel env add NAME <env> --value "<v>"`**(stdin/`echo|` 값주입은 `--non-interactive` 기본이라 무시됨). 공개값은 **`--no-sensitive`** 명시(아니면 sensitive 기본 → `vercel env pull`로 값 안 읽힘). **Production env 필수 4종**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`·`NEXT_PUBLIC_SITE_URL`(누락 시 env.ts Zod parse 실패 → **전 라우트 런타임 500**, 빌드는 성공하므로 배포 후 실제 200 검증 필수). **NEXT_PUBLIC_* 는 빌드타임 인라인** → env 변경 후 **재배포(`vercel --prod`)** 해야 반영. ⚠️ Preview env 3종 미설정(CLI `--yes + preview` 버그 → 대시보드에서 All Preview branches로).
