// 서브도메인별 진입 분기 규칙(순수 함수).
// 미들웨어가 이 결정만 사용한다 — 부수효과 없이 호스트·경로 → 리다이렉트 대상(또는 null) 계산.
//
// 설계(로드맵 S2): sales.jhtech.co.kr = 고객 공개 포털, admin.jhtech.co.kr = 관리자 콘솔.
// - admin 호스트로 루트(/) 진입 → /admin (이후 가드가 미인증=로그인·인증=대시보드 분기)
// - sales·로컬·Vercel 기본 도메인은 분기 없음(null) → 루트가 그대로 공개 포털.

// 관리자 콘솔로 보낼 호스트(소문자·포트 제거 기준). 스테이징 admin 호스트가 생기면 여기 추가.
const ADMIN_HOSTS = new Set(["admin.jhtech.co.kr"]);

/**
 * @param host  요청 Host 헤더(포트·대소문자 포함 가능, 없으면 null)
 * @param pathname  요청 경로
 * @returns 리다이렉트할 경로, 분기 불필요 시 null
 */
export function resolveHostRedirect(host: string | null, pathname: string): string | null {
  if (!host) return null;
  // 포트 제거 + 소문자 정규화(호스트는 대소문자 무시).
  const normalized = host.split(":")[0].toLowerCase();
  if (ADMIN_HOSTS.has(normalized) && pathname === "/") {
    return "/admin";
  }
  return null;
}
