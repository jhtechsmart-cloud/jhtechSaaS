import { z } from "zod";

// 환경변수 검증 (글로벌 규칙: env 추가 시 .env.example + Zod 스키마 동시).
// 지금은 존재 검증(min(1))만 — URL/포맷 강화는 기능 단계에서.
// 모듈 로드 시점이 아니라 호출 시점에 parse → 빌드 타임에 값 없어도 안전.

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().optional(), // 공개 사이트 절대 URL(메타·sitemap). 미설정 시 site.ts 기본값.
});

// 서버 전용 — 클라이언트 번들에 절대 포함 금지.
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
