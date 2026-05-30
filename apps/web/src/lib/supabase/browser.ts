"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";

// 브라우저 클라이언트 — 사용자 세션 JWT로 Storage 직접 업로드(P3) 등에 사용.
// NEXT_PUBLIC_* 는 빌드 시 인라인된다.
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
