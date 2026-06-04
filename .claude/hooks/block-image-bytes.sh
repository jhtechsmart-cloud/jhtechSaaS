#!/usr/bin/env bash
# PNG/스크린샷 원시 바이트가 컨텍스트에 유입되는 것을 막는 PreToolUse(Bash) 가드.
#
# 배경: 이미지(PNG)를 cat/grep/head/tail/xargs 등으로 "텍스트처럼" 읽으면
# 깨진 멀티바이트(외톨이 high surrogate)가 도구 출력에 섞여 들어가고,
# 그게 다음 API 요청 본문에 실려 "400 invalid high surrogate in string"으로
# 전체 대화가 막힌다. 이미지는 Read 도구(이미지로 안전 처리)로만 봐야 한다.
#
# 동작: stdin으로 받은 Bash tool_input.command 를 검사해
#   (1) 읽기 동사(cat/head/tail/grep/...)가 있고
#   (2) 대상이 *.png 또는 .gstack/{qa,canary}-reports 경로면
# permissionDecision=deny 로 차단한다. 그 외엔 아무 출력 없이 통과.

set -euo pipefail

# jq가 없으면 가드를 건너뛴다(차단 실패보다 통과가 안전 — 원래 동작 유지).
command -v jq >/dev/null 2>&1 || exit 0

cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
[ -z "$cmd" ] && exit 0

# (1) 파일 내용을 텍스트로 끌어오는 읽기 동사 (단어 경계 기준)
reads_re='(^|[ |;&(`$])(cat|head|tail|less|more|grep|egrep|fgrep|rg|od|xxd|hexdump|strings|nl|tac|base64)([ ]|$)'
# (2) 이미지/스크린샷 대상
target_re='(\.png([ "'"'"'`]|$)|\.gstack/(qa|canary)-reports)'

if printf '%s' "$cmd" | grep -Eq "$reads_re" && printf '%s' "$cmd" | grep -Eq "$target_re"; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"PNG/스크린샷을 텍스트로 읽으려는 명령을 차단했습니다. 이미지를 cat/grep 등으로 읽으면 깨진 바이트가 컨텍스트에 섞여 \"400 invalid high surrogate\" API 에러로 대화가 막힙니다. 이미지는 Read 도구로 보세요."}}'
  exit 0
fi

exit 0
