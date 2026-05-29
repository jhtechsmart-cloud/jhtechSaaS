import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase 클라이언트 팩토리 — anon용 / service_role용을 명확히 분리한다.
//
// ⚠️ service_role 키는 RLS를 전체 우회한다. createServiceClient는 서버 액션·
// Railway 워커 등 서버 전용 코드에서만 호출하고, 클라이언트 번들에 절대 포함하지 않는다.
// (env 경계: SUPABASE_SERVICE_ROLE_KEY에는 NEXT_PUBLIC_ 접두사 금지.)

function assertNonEmpty(url: string, key: string): void {
  if (!url) throw new Error("Supabase URL이 비어 있습니다");
  if (!key) throw new Error("Supabase key가 비어 있습니다");
}

/** 공개(anon) 클라이언트. 브라우저·anon 컨텍스트에서 RLS 적용을 받는다. */
export function createAnonClient(url: string, anonKey: string): SupabaseClient {
  assertNonEmpty(url, anonKey);
  return createClient(url, anonKey);
}

/**
 * service_role 클라이언트 — RLS 우회. 서버·워커 전용.
 * 세션을 유지·갱신하지 않도록(persistSession/autoRefreshToken false) 만들어
 * 서버·워커 환경에서 안전하게 stateless로 쓴다.
 */
export function createServiceClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  assertNonEmpty(url, serviceRoleKey);
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
