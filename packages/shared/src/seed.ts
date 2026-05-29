// 시드(부트스트랩) 안전 헬퍼 — 프로덕션에 약한 비번 관리자가 새는 것을 막는다.

/** Supabase URL이 로컬(개발)인지 판정. 비로컬은 프로덕션으로 취급해 가드를 강화한다. */
export function isLocalSupabaseUrl(url: string): boolean {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|.*\.local)(:|\/|$)/i.test(url);
}

/**
 * 시드 사용자 비밀번호 해석.
 * - 로컬: env 비번이 있으면 우선, 없으면 dev 기본값(편의).
 * - 프로덕션(비로컬): env 비번 필수 + 최소 길이 강제. 약한/기본 비번 사용 금지(백도어 방지).
 */
export function resolveSeedPassword(opts: {
  isLocal: boolean;
  envPassword?: string;
  devDefault: string;
  minProdLength?: number;
}): string {
  const { isLocal, envPassword, devDefault, minProdLength = 16 } = opts;
  if (isLocal) {
    return envPassword && envPassword.length > 0 ? envPassword : devDefault;
  }
  if (!envPassword) {
    throw new Error(
      "프로덕션 시드: 비밀번호 env가 필요합니다(약한 기본 비번 사용 금지).",
    );
  }
  if (envPassword.length < minProdLength) {
    throw new Error(
      `프로덕션 시드 비밀번호는 최소 ${minProdLength}자여야 합니다.`,
    );
  }
  return envPassword;
}
