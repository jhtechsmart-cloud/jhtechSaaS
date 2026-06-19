import { getPublicEnv } from "@/env";

// 아바타 이니셜 — 이름 첫 글자(한글/유니코드 안전), 없으면 fallback.
export function avatarInitial(name: string | null | undefined, fallback = "?"): string {
  const n = (name ?? "").trim();
  return n ? (Array.from(n)[0] ?? fallback) : fallback;
}

// 권한 라벨(2단) — users.manage=관리자 / else 영업담당.
export function roleLabel(isAdmin: boolean): string {
  return isAdmin ? "관리자" : "영업담당";
}

// 경로 → avatars 공개 URL(순수). equipment images 패턴과 동일.
export function buildAvatarPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;
}

// 경로(profiles.avatar_url) → public URL. 없으면 null. 서버·클라 공용(NEXT_PUBLIC_*).
export function avatarPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  return buildAvatarPublicUrl(NEXT_PUBLIC_SUPABASE_URL, path);
}
