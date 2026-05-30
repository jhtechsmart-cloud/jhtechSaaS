import { getPublicEnv } from "@/env";

// 이미지 업로드 제약(이슈 #3 D4·AC4). jpg/png/webp, 5MB.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ImageValidation = { ok: true } | { ok: false; error: string };

// 형식·크기 검증. 거부 시 "파일명: 사유" 메시지(인라인 칩에 그대로 노출).
export function validateImageFile(file: { type: string; size: number; name: string }): ImageValidation {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name}: 지원하지 않는 형식` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `${file.name}: 5MB 초과` };
  }
  return { ok: true };
}

// Storage 객체 경로 = equipment/{id}/{uuid}.{ext}. uuid는 호출부에서 주입(순수성).
export function equipmentImageObjectPath(
  equipmentId: string,
  file: { type: string },
  uuid: string,
): string {
  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  return `equipment/${equipmentId}/${uuid}.${ext}`;
}

// 경로 → public 버킷 URL(순수, 테스트용).
export function buildPublicImageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/equipment-images/${path}`;
}

// 경로 → public URL(env 래퍼). 서버 컴포넌트·클라 양쪽 사용(NEXT_PUBLIC_*).
export function publicImageUrl(path: string): string {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  return buildPublicImageUrl(NEXT_PUBLIC_SUPABASE_URL, path);
}
