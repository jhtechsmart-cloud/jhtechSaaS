// 로그인 후 되돌아갈 경로(next 파라미터) 정화 — open redirect(외부 사이트로 튕기기) 차단.
// 같은 앱 안의 절대경로("/..."만, "//host"·"http(s)://" 금지)만 허용, 그 외는 null.
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v.startsWith("/")) return null; // 상대·스킴 경로 금지
  if (v.startsWith("//")) return null; // protocol-relative(//evil.com) 금지
  if (/[\r\n\\]/.test(v)) return null; // 개행·백슬래시("/\evil.com" 브라우저 정규화 우회) 차단
  return v.length <= 500 ? v : null;
}
