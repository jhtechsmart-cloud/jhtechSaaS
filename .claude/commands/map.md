---
description: 프로젝트 지도(PROJECT-MAP.html) 재생성 — 4곳을 재스캔해 파일 인벤토리 + 단계별 파일 생성 맵을 갱신
---

# /map — 프로젝트 지도 갱신

`PROJECT-MAP.html`(프로젝트 루트)을 재생성한다. 목적: 사용자가 산출물 구조를 단계별로 이해하고, 문제 시 어느 파일을 볼지 알게 하는 것. 코드는 제외하고 정보/설정/진행/프롬프트를 담은 파일(.md/.json/.yaml/.jsonl/.toml/.env/.gitignore 등)이 대상.

## 1. 4곳을 재스캔한다

```bash
echo "=== 1) 프로젝트 폴더 비코드 파일 ==="
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
find . -type f \( -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' -o -name '*.jsonl' -o -name '*.toml' -o -name '.gitignore' -o -name '.env*' \) \
  -not -path './node_modules/*' -not -path '*/node_modules/*' -not -path './.git/*' -not -path '*/.next/*' 2>/dev/null | sort
echo "=== 2) gstack 계획 산출물 ==="
find ~/.gstack/projects/jhtechSaaS -type f 2>/dev/null | sed "s|$HOME|~|" | sort
echo "=== 3) 세션 기억 ==="
ls -1 ~/.claude/projects/-Users-seonjecho-Projects/memory/ 2>/dev/null
echo "=== 4) GitHub 이슈 ==="
gh issue list --repo jhtechsmart-cloud/jhtechSaaS --state all --limit 30 --json number,title,state 2>/dev/null
```

## 2. PROJECT-MAP.html을 재생성한다

기존 `PROJECT-MAP.html`을 베이스로, 위 스캔 결과를 반영해 갱신한다. 반드시 포함:

- **머리말**: 산출물이 4곳(프로젝트 폴더 / `~/.gstack/projects/jhtechSaaS/` / `~/.claude/.../memory/` / GitHub 이슈)에 흩어져 있음을 명확히. "폴더 안 vs 밖" 구분.
- **섹션 1 — 파일 인벤토리**: 4곳 각각 표로. 컬럼 = 파일 · 목적 · 내용 요약(간단) · 상태(커밋/gitignore/로컬/원격).
- **섹션 2 — 단계별 파일 생성 맵**: 단계(① 기획/office-hours → ② 셋업 → ③ 스펙/spec → ④ 검토/autoplan → ⑤ 디자인/design-consultation → 상시 기억 → 상시 지도/map → ⑥ 구현 → ⑦~⑨ 리뷰/QA/배포) 표 = 단계 · 명령어 · 생기는 파일(위치) · 담기는 내용. + 단계 흐름 다이어그램(완료/다음 단계 표시).
- **섹션 3 — 문제 시 어디를 보나**: 증상/알고 싶은 것 → 볼 파일 위치 빠른 참조표.
- 새로 생긴 단계·파일이 있으면 추가하고, 현재 진행 단계를 흐름 다이어그램에 반영(done/next).
- 갱신 날짜를 헤더에 업데이트.

## 3. 디자인

`DESIGN.md`(프로젝트 루트)를 따른다: Pretendard(한글 UI) + JetBrains Mono(경로·코드), 중립 그레이 + deep teal 액센트 + 상태 색, 명료한 표 중심, 라이트/다크 토글. 기존 PROJECT-MAP.html의 CSS를 재사용해도 됨.

단계별 파일 생성 맵 표는 `class="pmap"` + `<colgroup>`(단계 96px / 명령어 160px / 생기는 파일 auto / 담기는 내용 200px) + `table-layout:fixed`를 쓴다. 단계·명령어 셀은 한 줄(nowrap), 생기는 파일 셀(.path)은 셀 안에서 줄바꿈(word-break). "(상시)"·진행표시 같은 부가 정보는 단계 셀이 아니라 명령어 셀에 작게 둔다(단계는 짧은 라벨 1줄 유지).

## 4. 커밋

재생성 후 커밋한다 (PR 아님, 로컬 커밋):
```
docs: 프로젝트 지도(PROJECT-MAP.html) 갱신
```
push는 사용자가 요청할 때만.

## 규칙
- 코드 파일(.ts/.tsx/.js 등)은 인벤토리에서 제외. 정보·설정·진행·프롬프트 파일만.
- 시크릿 값(.env.local, .env, openai.json 등)의 **내용(키 값)은 절대 출력·기재 금지**. "시크릿 — Supabase 키" 식으로 목적만.
- 사용자가 용어·구조를 이해하는 게 목표 — 요약은 짧고 평이하게.
