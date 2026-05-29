#!/usr/bin/env bash
# 로컬 Supabase에 부트스트랩 관리자 + 개발 사용자 시드.
# supabase status 에서 API URL / service_role 키를 뽑아 워커 시드 스크립트를 실행한다.
set -euo pipefail

cd "$(dirname "$0")/../.."

eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"

SUPABASE_URL="$API_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  pnpm --filter worker seed:admin
