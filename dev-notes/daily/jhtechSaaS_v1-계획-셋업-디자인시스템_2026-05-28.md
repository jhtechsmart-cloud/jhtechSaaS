# jhtechSaaS — Dev Note: v1-계획-셋업-디자인시스템

> **📅 Date:** 2026-05-28 · **🗂️ Project:** jhtechSaaS · **🏷️ Main Task:** v1-계획-셋업-디자인시스템
> **👤 Author:** — · **🔖 Tags:** planning, architecture, gstack, supabase, monorepo, design-system, permissions, phase-0

---

## TL;DR

재현테크 견적관리 SaaS(jhtechSaaS) v1의 전 계획 단계 완주 — 기획(office-hours)→스펙(/spec)→검토(/autoplan)→디자인 시스템(/design-consultation)→프로젝트 지도(/map). 단일테넌트·아키텍처B(Vercel+Supabase+Railway 워커)·capability 권한 확정. 기능 코드 0줄, 인프라·계획·디자인 토대 완성. 다음은 E1 구현.

---

## Today's Work

### 🔧 `chore(infra)`: Phase 0 인프라 셋업 — pnpm 모노레포 + Supabase + 멀티계정 SSH

**Status:** `completed`  
**Files changed:** `package.json`, `pnpm-workspace.yaml`, `apps/web/*`, `apps/worker/*`, `packages/shared/*`, `supabase/config.toml`, `.env.example`, `apps/web/src/env.ts`, `apps/worker/src/env.ts`, `~/.ssh/config`

#### 📋 Context (왜)

jhtechSaaS는 CLAUDE.md만 있던 그린필드. 기능 구현 전 repo·모노레포·DB·인증 토대가 필요했다.

#### 🔨 Implementation (무엇을 어떻게)

pnpm 모노레포(apps/web=Next.js→Vercel, apps/worker=Node→Railway, packages/shared=공유). Supabase init + jhtechSaaS 프로젝트(Seoul) 연결. 계정별 SSH 키로 개인(koreakingLab)·업무(jhtechsmart-cloud) 2계정을 전환 없이 분리. 환경변수는 Zod로 검증.

#### 💻 Key Code

**`apps/web/src/env.ts`**

```typescript
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});
// import 시점 아닌 호출 시점에 parse → 빌드 타임 값 없어도 안전
export function getPublicEnv() {
  return publicEnvSchema.parse({ /* process.env... */ });
}
```

_env는 호출 시점에 parse (lazy) — 빌드 안전_

**`~/.ssh/config`**

```bash
Host github-jhtech
  HostName github.com
  IdentityFile ~/.ssh/id_ed25519_jhtech
  IdentitiesOnly yes
# remote: git@github-jhtech:jhtechsmart-cloud/jhtechSaaS.git
```

_계정별 SSH — push 시 계정 자동 선택, 전환 불필요_

#### 📐 Architecture Decisions (ADR)

**Decision:** 모노레포(web+worker+shared) — 아키텍처B의 워커가 확정이라 한 번에 구조 잡음


**Decision:** 계정별 SSH 키 방식 — gh auth switch는 전역이라 전환 실수 위험, SSH는 repo별 자동


**Decision:** 메일 발신 = Gmail SMTP(jhtechsmart@gmail.com) — Resend/SES는 gmail.com 도메인 인증 불가


#### 🐛 Problems & Solutions

**Problem:** gh가 개인계정(koreakingLab)으로 로그인됐는데 repo는 업무계정(jhtechsmart-cloud) 소유 → SSH alias + gh auth login으로 해결. (사용자가 'JHTech'라 한 실제 login명은 jhtechsmart-cloud였음)


**Problem:** create-next-app이 'path not writable'로 실패 → apps/web 디렉터리 선생성 후 재시도


**Problem:** zod 4가 .url()/.email() API 변경 → 스캐폴드는 z.string().min(1)만 사용


**Problem:** worker tsc가 process.env에서 실패 → @types/node 추가


#### 💡 Learnings

- gh auth switch는 머신 전역(프로젝트별 아님). 멀티 GitHub 계정은 SSH per-account가 정석.
- create-next-app(pnpm10)이 apps/web에 중첩 pnpm-workspace.yaml을 넣음 → 루트로 통합 필요.

---

### 📝 `docs(planning)`: /spec — v1 EPIC + 7 child 백로그(GitHub 이슈) 정의

**Status:** `completed`  
**Files changed:** `~/.gstack/projects/jhtechSaaS/specs/20260528-164821-epic-jhtechsaas-v1.md`, `GitHub issues #1~#8`

#### 📋 Context (왜)

office-hours design doc 승인 후, 요구사항을 실행 가능한 백로그로 떨궈야 했다.

#### 🔨 Implementation (무엇을 어떻게)

EPIC #1 + E1~E7(#2~#8) 이슈를 의존성·수용기준(AC)과 함께 생성. 단일테넌트 Postgres 스키마 스케치(profiles/equipment/applications/quotes/email_log).

#### 📐 Architecture Decisions (ADR)

**Decision:** 권한 = capability(데이터 기반). role enum 거부. profiles.permissions[] + 코드 permission registry + RLS has_permission(). 미래 역할(창고/설치팀)은 권한 키만 추가(스키마 변경 0).


**Decision:** 핵심 원리: '메커니즘은 지금 확정, taxonomy(권한 종류)는 기능 만들 때마다 1개씩 추가' — 지금 다 못 정해도 됨


#### 🐛 Problems & Solutions

**Problem:** codex 품질 게이트가 계정 모델 제한으로 스킵됨


**Problem:** gh 계정 불일치로 처음엔 이슈 파일링 불가 → 사용자가 업무계정 인증 후 8개 생성


---

### 📝 `docs(review)`: /autoplan — 계획 검토(CEO/Design/Eng) 및 승인

**Status:** `completed`  
**Files changed:** `~/.gstack/projects/jhtechSaaS/main-autoplan-review-20260528-173317.md`, `EPIC #1 코멘트`

#### 📋 Context (왜)

구현 전 아키텍처·범위를 다중 관점으로 검토하고 미해결 설계를 닫아야 했다.

#### 🔨 Implementation (무엇을 어떻게)

Codex가 계정 모델 제한으로 다운 → Claude 독립 서브에이전트 단일 voice. Eng 리뷰가 EPIC의 미해결 빈칸을 구체적으로 해결.

#### 📐 Architecture Decisions (ADR)

**Decision:** 워커 잡 트리거 = jobs 큐 테이블 + Railway 폴링 FOR UPDATE SKIP LOCKED (webhook/Realtime 함정 회피)


**Decision:** has_permission() = SECURITY DEFINER + search_path='' + InitPlan 래핑(재귀·권한상승·성능)


**Decision:** 견적 버전 = MAX(version) + UNIQUE(application_id, version) (is_latest 토글 레이스 제거)


**Decision:** row scope = assignee_id=auth.uid() OR has_permission('applications.view_all') 명문화


**Decision:** anon 폼 = INSERT만 + WITH CHECK + Turnstile, service_role 서버 전용, PDF=Puppeteer+Pretendard


**Decision:** UI-SPEC 게이트를 E2 앞에 추가. 사용자는 premise 게이트에서 Railway 워커+capability 유지 선택


#### 🐛 Problems & Solutions

**Problem:** codex가 gpt-5.4/gpt-5 미지원(ChatGPT 계정) → dual-voice 불가, 단일 voice로 진행


---

### 📝 `docs(design)`: /design-consultation — DESIGN.md 디자인 시스템

**Status:** `completed`  
**Files changed:** `DESIGN.md`, `CLAUDE.md`, `~/.gstack/projects/jhtechSaaS/designs/design-system-20260528/design-preview.html`

#### 📋 Context (왜)

현 174KB 모놀리식 admin.html의 무계획 레이아웃을 대체할 fresh design 시스템이 필요했다.

#### 🔨 Implementation (무엇을 어떻게)

북극성='복잡한 것을 한눈에'(명료함). industrial-clean. Pretendard(한글 UI)+JetBrains Mono(숫자·식별자 tabular). 중립 그레이+deep teal 액센트+상태 색 스파인. HTML 프리뷰로 관리자 콘솔에 적용해 확인.

#### 📐 Architecture Decisions (ADR)

**Decision:** 북극성=명료함 → 장식 최소·강한 위계·색은 의미(상태)로만


**Decision:** 상태(신규/배정/견적중/발송완료/실패)를 1급 색 스파인으로, 숫자·식별자는 mono+tabular


#### 🐛 Problems & Solutions

**Problem:** AI 목업($D variants)이 OpenAI 조직 인증(gpt-image-1) 요구 → HTML 프리뷰로 대체. 키는 ~/.gstack/openai.json에 등록됨(인증 후 생성 가능)


---

### 📝 `docs(tooling)`: 프로젝트 지도(PROJECT-MAP.html) + /map 명령어

**Status:** `completed`  
**Files changed:** `PROJECT-MAP.html`, `.claude/commands/map.md`, `.gitignore`

#### 📋 Context (왜)

사용자가 산출물이 4곳(프로젝트 폴더·~/.gstack·~/.claude memory·GitHub)에 흩어진 구조와 용어가 낯설어, 단계별 이해 + 문제 시 어디를 볼지 알 수 있는 지도가 필요했다.

#### 🔨 Implementation (무엇을 어떻게)

4곳 파일 인벤토리 + 단계별 파일 생성 맵 + 문제 시 참조표를 DESIGN.md 스타일 HTML로. /map 슬래시 명령어로 재생성(4곳 재스캔). 표 컬럼 폭은 table-layout:fixed+colgroup으로 단계·명령어 한 줄 고정.

#### 📐 Architecture Decisions (ADR)

**Decision:** 반복 정리 작업을 커스텀 슬래시 명령(.claude/commands/map.md)으로 만들어 매번 타이핑 불필요


#### 💡 Learnings

- gstack 산출물은 프로젝트 폴더 밖(~/.gstack)에 저장됨 — 사용자가 가장 헷갈려한 지점

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 결정 못 할 때 — 메커니즘/taxonomy 분리

```
관리자가 사용자를 추가할 때 권한을 체크박스로 지정하게 하고 싶은데, 아직 권한 종류를 정확히 모르겠어. 지금 정하기 힘든데 어떻게 하는게 좋을까?
```

**교훈:** '지금 다 못 정하는 결정'은 '메커니즘(어떻게 저장·검사)은 지금 확정, 세부 목록(taxonomy)은 기능 만들 때마다 점진 추가'로 쪼개면 풀린다. → capability 권한 모델.

### ✅ 잘 통한 프롬프트: 워크플로 정식 루트 묻기

```
원래 g-stack 개발자가 사용하는 정식 루트는? office-hours 다음에 뭘 해야해?
```

**교훈:** 도구 체계가 낯설 때 '정식 루트가 뭐냐'를 먼저 물으면 이후 단계 선택이 쉬워지고 GSD/gstack 혼용 같은 함정을 피한다.

### ✅ 잘 통한 프롬프트: 구조 이해용 정리 + 명령어화

```
용어가 낯설어 이해가 안 됨. 지금까지 만든 파일의 위치·목적·내용과 단계별 생성 파일을 HTML로 정리하고, 명령어 하나로 재생성하게 만들어줘.
```

**교훈:** 반복할 정리 작업은 '산출물(HTML) + 슬래시 명령어'로 만들면 매번 길게 타이핑할 필요가 없다. 이해를 위한 산출물은 시각화(표·다이어그램)가 효과적.

### ✅ 잘 통한 프롬프트: 새 도구 도입 전 중복 확인

```
다른 프로젝트에선 devnote로 그날 개발 내용을 정리하는데, 지금 쓰면 중복일까? 확인해봐.
```

**교훈:** 새 도구 도입 전 기존 산출물과 '축'이 겹치는지 확인(시간순 vs 구조 vs 기억). 겹치지 않으면 보완 관계.

---

## 📋 Changes Summary

### Added

- pnpm 모노레포 골격(web/worker/shared)
- Supabase 연결(jhtechSaaS 프로젝트)
- 계정별 SSH 인증
- v1 EPIC + 7 child 이슈(#1~#8)
- autoplan 리뷰 문서
- DESIGN.md 디자인 시스템
- PROJECT-MAP.html + /map 명령어

### Changed

- CLAUDE.md(Design System 규칙 추가)
- .gitignore(.devnote-scratch, settings.local.json)

### Fixed

- PROJECT-MAP 단계 맵 표 컬럼 폭(table-layout:fixed)

---

## ⏭️ Next Steps

- [ ] E1(#2) Foundation 구현 — 스키마+Auth+capability RLS+Storage. autoplan E1 게이트(has_permission SECURITY DEFINER·row scope·service_role/anon WITH CHECK) 적용, Superpowers TDD
- [ ] E2 착수 전 UI-SPEC(surface별 5-state·콘솔 정보위계·반응형 분리) 작성
- [ ] (선택) OpenAI 조직 인증 → AI 목업 생성 / codex 모델 설정 수정 → dual-voice 복구

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> jhtechSaaS는 단일테넌트·capability 권한·아키텍처B(Vercel+Supabase+Railway 워커) 전제다. 구현 전 반드시 DESIGN.md와 EPIC #1 코멘트의 autoplan 해결책(워커=jobs 큐+SKIP LOCKED 폴링, has_permission=SECURITY DEFINER+InitPlan, 버전=MAX+UNIQUE, row scope 명문화, anon WITH CHECK)을 따른다. E1(#2)부터 Superpowers TDD로 시작.

**Reusable patterns introduced today:**

- `호출 시점 env 검증(Zod lazy)` — import 시점 아닌 함수 호출 시 parse → 빌드 타임에 값 없어도 안전
    - 파일: `apps/web/src/env.ts`
- `계정별 SSH 라우팅` — ~/.ssh/config Host alias + remote URL로 멀티 GitHub 계정을 전환 없이 push
    - 파일: `~/.ssh/config`
- `큐 테이블 + SKIP LOCKED 폴링(예정)` — 워커 잡 트리거 — webhook/Realtime보다 solo 디버깅 쉬움. E5에서 구현
    - 파일: `(E5 구현 예정)`
