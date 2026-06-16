// 새 비밀번호 규칙 — 최소 8자, 현재 비밀번호와 동일 금지(사용자 결정 "느슨함").
// 비밀번호는 trim하지 않는다(공백도 유효 문자). 위반 메시지(string) | 통과(null) 반환.
export function validateNewPassword(
  next: string,
  opts: { current?: string },
): string | null {
  if (next.length < 8) return "비밀번호는 8자 이상이어야 합니다";
  if (opts.current !== undefined && next === opts.current) {
    return "현재 비밀번호와 다른 비밀번호를 입력하세요";
  }
  return null;
}
