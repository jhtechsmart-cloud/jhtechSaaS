# jhtechsaas — Dev Note: M2-customer-portal-brainstorm-and-prod-recovery

> **📅 Date:** 2026-06-01 · **🗂️ Project:** jhtechsaas · **🏷️ Main Task:** M2-customer-portal-brainstorm-and-prod-recovery
> **👤 Author:** — · **🔖 Tags:** vercel, supabase, notion, roadmap, brainstorm, milestone, ops, privacy

---

## TL;DR

프로덕션 500 긴급 복구(Vercel에 Supabase env 통째 누락 → 4종 설정·재배포로 라이브 회복) + Notion PRD 자동 채우기 + 로드맵 단일원본→Notion 동기화 배선 + M2 '고객 포털' 마일스톤 brainstorm·등록(설계문서·GitHub EPIC #18~#25·로드맵). 앱 코드 변경 0, 운영/문서/계획 작업.

---

## Today's Work

### 🐛 `fix(deploy/web)`: 프로덕션 500 긴급 복구 — Vercel Supabase env 통째 누락

**Status:** `completed`  
**Files changed:** _(미지정)_

#### 📋 Context (왜)

NEXT_PUBLIC_SITE_URL 설정하려다 검증 중 발견: Vercel 프로젝트에 env가 SITE_URL 하나뿐이고 Supabase env(URL·anon·service_role)가 전혀 없어 env.ts Zod parse가 런타임에 throw → 전 라우트 500. PR #17 자동배포 포함 프로덕션은 라이브로 동작한 적이 없었음(QA는 로컬 Supabase로만 수행).

#### 🔨 Implementation (무엇을 어떻게)

로컬 .env.local·worker .env(둘 다 프로덕션 okxmeqrvtlvmxfltsara 가리킴)에서 값 추출 → vercel env add --value(--no-sensitive: URL·anon / --sensitive: service_role)로 Production 주입 → vercel --prod 재배포 → 전 라우트 200·sitemap 절대URL 검증.

#### 💡 Learnings

- Vercel CLI는 에이전트 환경에서 --non-interactive 기본 → stdin/echo 값주입 무시. 반드시 --value 플래그.
- Production 변수는 기본 sensitive(pull로 값 안읽힘) → 공개값은 --no-sensitive 명시.
- 모노레포 Root Directory=apps/web면 .vercel 링크는 repo 루트에. (apps/web에 두면 경로 중복 에러)
- '배포 완료' != '라이브 동작' — env 누락 시 빌드 성공해도 런타임 500. 배포 후 실제 200 검증 필수.

---

### 📝 `docs(notion)`: Notion PRD 자동 채우기 — 빈 템플릿 → 실데이터

**Status:** `completed`  
**Files changed:** _(미지정)_

#### 📋 Context (왜)

대표 보고용 개발계획서(Notion)가 빈 PRD 템플릿. 사용자의 기존 hook 기반 Notion 동기화(~/scripts/claude-notion-sync, NOTION_TOKEN + @notionhq/client) 재사용.

#### 🔨 Implementation (무엇을 어떻게)

lib/markdown.ts(markdownToNotionBlocks) 재사용 + notion-apply.ts(update/appendAfter/appendChild/updateRow/appendTableRows) 작성. 상단 콜아웃 2개 미접촉, [1] 범위 콜아웃 이후 섹션 0~15 in-place 채움 + 진행현황 콜아웃 신규 + 14)표 E1~E7 + 기능 DB F-001~F-009.

#### 💡 Learnings

- 사용자 'Notion MCP'는 실제론 Stop-hook 스크립트 + 통합 토큰. 같은 토큰·SDK 재사용으로 임의 페이지 읽기/쓰기 가능.
- Notion 편집은 블록 ID 단위 — id 포함 트리 JSON 덤프해두면 정밀 in-place 수정 가능.

---

### ✨ `feat(docs/tooling)`: 로드맵 단일원본 → ROADMAP.md + Notion 동기화 배선

**Status:** `completed`  
**Files changed:** `docs/roadmap.json`, `docs/ROADMAP.md`, `scripts/roadmap-sync.sh`, `package.json`

#### 📋 Context (왜)

개발 진행을 한 곳에서 고치면 repo 문서와 Notion이 함께 갱신되도록. 대표·개발 양쪽이 전체 계획+현재 위치 상시 확인.

#### 🔨 Implementation (무엇을 어떻게)

docs/roadmap.json(단일 진실 원본) → sync-roadmap.ts가 docs/ROADMAP.md 생성 + Notion 라이브영역(콜아웃·14표·기능DB) 멱등 동기화. pnpm roadmap:sync + scripts/roadmap-sync.sh. M2 추가 시 마일스톤 인식(M1/M2 그룹 요약)으로 보강.

---

### 📝 `docs(planning)`: M2 '고객 포털 & 운영 백본' 마일스톤 brainstorm·등록

**Status:** `completed`  
**Files changed:** _(미지정)_

#### 📋 Context (왜)

'상세페이지 재구성'으로 시작했으나 실제론 고객 포털 3분기(견적요청/AS신청/소모품신청) 신설. 어제(5/31) 상세 재구성은 논의만 하고 미구현(미리보기 mockup만)이라 사이트엔 옛 E3판만 떠 있었음 — transcript에서 복원해 반영.

#### 🔨 Implementation (무엇을 어떻게)

brainstorming 스킬로 3흐름 수집 → 설계문서(docs/superpowers/specs/2026-06-01-m2-customer-portal-design.md, 결정 D1~D10·데이터모델·P-A~P-G) 작성·커밋 → GitHub EPIC #18 + 자식 #19~#25 → 로드맵/Notion 등록.

#### 📐 Architecture Decisions (ADR)

**Decision:** 1견적=1장비. 견적폼 사진 선택·제출 시에만 업로드(고아 없음).


**Decision:** 개인정보 동의: applications 동의 3컬럼 + privacy_policies 버전 테이블. 문구 v1.0 사용자 제공.


**Decision:** 사업자번호 1차 체크섬(클라+서버). 국세청 상태조회·pgcrypto 암호화는 후속.


**Decision:** 고객·구매 마스터 = admin 수기 + 견적확정 자동. 익명 biz_no 조회 B2B 저위험 전체 노출.


**Decision:** 파기 cron·접수증 PDF·알림 = Railway 워커(Edge Function 회피).


#### 💡 Learnings

- 사용자 기억과 코드 불일치 시 추측 말고 transcript jsonl(세션/turn id)에서 복원 — 어제 미리보기·참조 이미지 그대로 회수.
- 단일 폼처럼 보여도 데이터 전제(고객·구매 마스터)가 깔리면 마일스톤 규모 → 즉시 분해.

---

## 🎯 Prompt Library

> 오늘 Claude Code에게 보낸 프롬프트 중 학습 가치가 있는 것들.

### ✅ 잘 통한 프롬프트: 사이트 직접 띄워 brainstorm

```
사이트 보면서 brainstorming하자
```

**교훈:** 실제 사이트를 띄우면 숨은 문제가 드러난다 — 이 한마디로 프로덕션 500(env 누락)과 '어제 설계 미구현'을 동시에 발견.

### ✅ 잘 통한 프롬프트: 코드-기억 불일치 복원

```
이건 상세페이지가 예전꺼인데? ... session/turn id 로 찾아봐
```

**교훈:** 세션/turn id를 주면 transcript에서 과거 작업(미리보기·결정)을 정확히 복원. 추측 금지의 좋은 예.

### ✅ 잘 통한 프롬프트: 대규모 요구 일괄 설명

```
A/S신청부터 설명할게 ... 사업자번호로 DB 조회 ...
```

**교훈:** 흐름 전체를 한 번에 받으면 마일스톤 분해가 명확해진다. AS/소모품 공통 전제(고객·구매 마스터)가 핵심 선행.

---

## 📚 References & 외부 학습

- **[어제 상세페이지 미리보기 mockup](~/workspace/e3-detail-mockup.html)** `P-A`
    - P-A 상세 재구성 기준
- **[참조 이미지(highlights·그룹사양)](~/workspace/SCR-20260531-tprs.jpeg / tpvi.png)** `P-A`
    - FLORA UV프린터 제품페이지 레퍼런스
- **[M2 EPIC](https://github.com/jhtechsmart-cloud/jhtechSaaS/issues/18)** `milestone`
    - P-A~P-G = #19~#25

---

## 📋 Changes Summary

### Added

- docs/roadmap.json 단일원본 + pnpm roadmap:sync + Notion 동기화
- M2 설계문서 + GitHub EPIC #18·P-A~P-G(#19~#25)
- Vercel Production Supabase env 3종 + SITE_URL

### Changed

- CLAUDE.md에 로드맵 sync(/eod) 배선 문서화
- 로드맵 sync 마일스톤 인식(M1/M2)

### Fixed

- 프로덕션 전 라우트 500 (Vercel env 누락) → 라이브 회복

---

## ⏭️ Next Steps

- [ ] P-A(견적요청 v2) 자체 상세 spec→plan: §9 미결정(그룹사양 jsonb·아이콘셋, highlights/youtube admin 위젯, customer-uploads 버킷 정책) 확정부터
- [ ] Vercel Preview env 3종 설정(CLI 버그로 보류 → 대시보드)
- [ ] 외부 의존: 카톡/문자 발송사 가입·발신프로필 심사(P-G 전), 개인정보처리방침 법무
- [ ] 미푸시 docs 4커밋은 P-A 브랜치 분기 시 자연 포함(또는 승인 시 push)

---

## 🤖 Claude Code Hints

> **For future Claude Code sessions reading this note:**
> 다음 세션은 start 후 P-A(견적요청 v2)부터 — 설계문서 docs/superpowers/specs/2026-06-01-m2-customer-portal-design.md와 어제 mockup ~/workspace/e3-detail-mockup.html 기준으로 P-A 자체 spec→plan 진행. 각 단계 독립 사이클(거대 플랜 금지). 로드맵 갱신은 docs/roadmap.json 수정 후 pnpm roadmap:sync. main 직접 push 금지.

**Reusable patterns introduced today:**

- `Notion 페이지 정밀 편집기` — 토큰 재사용 + 블록 ID 덤프 + update/appendAfter/updateRow ops JSON 적용
    - 파일: `~/scripts/claude-notion-sync/notion-apply.ts`
- `repo 원본 → Notion 거울 동기화` — 구조화 JSON 원본, 생성물(MD)+외부거울(Notion) 멱등 동기화. 엔진은 토큰 가진 외부 디렉터리에.
    - 파일: `~/scripts/claude-notion-sync/sync-roadmap.ts`
