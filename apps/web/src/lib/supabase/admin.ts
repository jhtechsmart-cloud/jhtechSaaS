import "server-only";
import { createServiceClient } from "@jhtechsaas/shared";
import { getPublicEnv, getServerEnv } from "@/env";

// service_role admin 클라이언트 — RLS 전면 우회 + auth.admin API(계정 생성·이메일 조회).
// 🔴 "server-only" 첫 줄 필수: 이 모듈이 클라이언트 번들에 들어가면 service_role 키가 유출돼
//    RLS가 전면 우회된다. 서버 컴포넌트·서버 액션에서만 import할 것.
export function createSupabaseAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createServiceClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}
