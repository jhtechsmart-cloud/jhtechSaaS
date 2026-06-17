// 로그인 화면 "이메일 저장" 기능의 쿠키 직렬화/역직렬화(순수 로직).
// SSR되는 클라 컴포넌트라 localStorage 금지 → 쿠키로 영속(서버가 읽어 초기값 주입).
// 비밀번호급 비밀은 아니지만 식별자라 JS에서 읽을 수 있게 httpOnly 미사용(클라가 직접 씀).

export const SAVED_EMAIL_COOKIE = "jh.savedEmail";

// 1년. 사이드바·캘린더 선호 쿠키와 동일한 만료.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * 체크박스 상태·이메일 → document.cookie에 대입할 문자열.
 * 저장 해제거나 이메일이 비어 있으면 즉시 만료(삭제) 쿠키를 돌려준다.
 */
export function buildSavedEmailCookie(email: string, remember: boolean): string {
  const trimmed = email.trim();
  const base = `${SAVED_EMAIL_COOKIE}=`;
  const attrs = "path=/;samesite=lax";
  if (!remember || !trimmed) {
    // 삭제 — 값 비우고 max-age=0.
    return `${base};${attrs};max-age=0`;
  }
  return `${base}${encodeURIComponent(trimmed)};${attrs};max-age=${ONE_YEAR_SECONDS}`;
}

/**
 * 쿠키에서 읽은 원시 값(인코딩됨)을 디코드한 이메일로. 없거나 깨졌으면 빈 문자열.
 */
export function parseSavedEmail(raw: string | undefined | null): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // 깨진 인코딩(예: 잘린 %시퀀스)은 무시 — fail-safe.
    return "";
  }
}
