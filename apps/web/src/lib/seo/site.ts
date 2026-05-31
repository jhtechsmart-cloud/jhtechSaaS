// 사이트 절대 URL 베이스(metadataBase·OG·sitemap). NEXT_PUBLIC_SITE_URL 미설정 시 로컬 기본값.
// 주의: 모듈 로드 시점(layout metadata) 안전을 위해 getPublicEnv(필수 supabase 변수 parse) 대신
// process.env를 직접 읽는다. NEXT_PUBLIC_* 는 Next 빌드 시 인라인되어 서버·클라 모두 사용 가능.
const DEFAULT_SITE_URL = "http://localhost:3000";

export function resolveSiteUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return DEFAULT_SITE_URL;
  return v.replace(/\/+$/, "");
}

export function siteUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}
