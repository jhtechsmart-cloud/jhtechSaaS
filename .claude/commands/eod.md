---
description: 하루 작업 마무리(end of day) — 커밋·push·빌드 확인 + 개발 노트(/devnote) + memory 다음 액션 + CLAUDE.md 점검 + 구조 지도(/map)
---

# /eod — 하루 작업 마무리

오늘 작업을 안전하게 마무리한다. 목표: **작업 손실 0, 다음 세션이 끊김 없이 이어가게.** 아침 `start`와 짝.

## 1. git 상태 점검 (작업 손실 방지)

```bash
cd "$(git rev-parse --show-toplevel)"
echo "=== 미커밋 변경 ==="; git status --short | grep -vE 'node_modules' || echo clean
echo "=== push 안 된 커밋 ==="; git log "origin/$(git branch --show-current)..HEAD" --oneline 2>/dev/null || true
```
- 미커밋 변경이 있으면 의미 단위로 커밋. **`git add -A` 절대 금지** — 파일 지정. 시크릿(`.env*`, `openai.json`)·빌드 산출물 제외.
- 미완 작업이면 `WIP:` 커밋 + 메시지에 "무엇이 남았는지" 한 줄.
- push 안 된 커밋이 있으면 `git push` (이 repo는 SSH alias `github-jhtech`라 계정 전환 불필요). `main` 직접 push 등 글로벌 CLAUDE.md 규칙 준수.

## 2. 빌드/타입 검증 (깨진 상태로 안 끝내기)

```bash
pnpm -r typecheck 2>&1 | tail -5
pnpm --filter web build 2>&1 | tail -5
```
- 실패면 사용자에게 보고. 가능하면 고치고, 미완이면 WIP 커밋 + 다음 할 일 명시 후 마무리.

## 3. 개발 노트 — /devnote

dev-note-manager 스킬로 오늘 일지 생성. 주의: 프롬프트는 **학습 가치 있는 것만 큐레이션**(트리비얼·시크릿 붙여넣기 제외), `functions_catalog`가 `.next`/`node_modules`(빌드 산출물)를 긁지 않게 스캔 전 `apps/*/.next`·`dist` 제거. 노트에 시크릿 값 절대 기재 금지.

## 4. memory '다음 액션' 갱신 (다음 세션 연결)

`~/.claude/projects/-Users-seonjecho-Projects-jhtechSaaS/memory/jhtechsaas-project.md`의 진행 상태/다음 액션을 오늘 끝난 지점 기준으로 갱신. **"다음 = …"이 명확**해야 아침 `start`가 바로 이어간다.

## 5. CLAUDE.md 점검 (루트·프로젝트 최신 유지)

오늘 작업 전체를 살펴보고 **루트 CLAUDE.md**(`~/.claude/CLAUDE.md`)·**프로젝트 CLAUDE.md**에 추가/보강할 내용이 있는지 점검.
- 반영 후보: 새로 정한 규칙·작업 관행, 확정된 아키텍처 결정·전제 변경, 반복된 Claude 실수("Living Doc" 한 줄), 새 명령·도구·경로.
- **변경은 사용자에게 먼저 보고 후 적용**(글로벌 규칙: 요청 안 한 수정·리팩터 금지). 반영할 게 없으면 "보강 없음"으로 보고.
- 루트는 전역 기준선이라 200줄 이내 유지 + 모든 프로젝트 공통만. 프로젝트 한정 내용은 프로젝트 CLAUDE.md에.

## 6. 구조 지도 — /map (파일·단계 바뀌었으면)

새 단계 산출물/파일이 생겼으면 `/map`으로 `PROJECT-MAP.html` 갱신.

## 6. 마무리 보고 (3~5줄)

- 오늘 한 일 한 줄
- 커밋/push 상태 (clean & synced?)
- 빌드 상태
- **다음 세션 시작점** ("`start` 치면 여기서 이어감")

## 규칙
- `git add -A` 금지(파일 지정). 시크릿 커밋 금지. 빌드 깨진 채 push 금지. `main` 직접 push 금지.
- 노트·지도에 키·비번 값 절대 기재 금지.
- 이미 마무리된 상태(clean·push·노트·memory 다 됨)면 보고만 하고 중복 작업 안 함.
