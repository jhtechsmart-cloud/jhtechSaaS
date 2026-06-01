#!/usr/bin/env bash
# jhtechSaaS 로드맵 동기화: docs/roadmap.json → docs/ROADMAP.md 재생성 + Notion 라이브영역 갱신.
# Notion 토큰·SDK는 ~/scripts/claude-notion-sync(@notionhq/client + .env NOTION_TOKEN) 재사용.
# 사용: scripts/roadmap-sync.sh            (생성 + Notion 동기화)
#       scripts/roadmap-sync.sh --no-notion (ROADMAP.md만 재생성, Notion 스킵)
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_DIR="$HOME/scripts/claude-notion-sync"

if [ ! -f "$SYNC_DIR/sync-roadmap.ts" ]; then
  echo "✗ 동기화 스크립트 없음: $SYNC_DIR/sync-roadmap.ts" >&2
  echo "  (Notion 동기화 도구가 이 머신에 설치돼 있어야 함)" >&2
  exit 1
fi

( cd "$SYNC_DIR" && npx tsx sync-roadmap.ts "$REPO_DIR/docs/roadmap.json" "$@" )
