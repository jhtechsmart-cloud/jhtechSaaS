import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PhotoSlot } from "./schema";

// 허용 MIME → 확장자 매핑. customer-uploads anon 정책의 정규식(jpg|png|webp)과 일치해야 함.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// 사진 슬롯별 한국어 라벨 — 폼 UI에서 재사용.
export const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 출입구",
  ext_building: "건물 외관",
  int_entrance: "내부 출입구",
  int_location: "설치 예정 장소",
};

/**
 * 버킷-상대 경로 빌더: `<submissionId>/<slot>.<ext>`.
 * customer-uploads anon INSERT 정책 정규식 `^<uuid>/<slot>.(jpg|png|webp)$` 와 동일 형식.
 * 허용 MIME(jpg/png/webp) 외에는 null 반환.
 */
export function buildPhotoPath(
  submissionId: string,
  slot: PhotoSlot,
  mime: string,
): string | null {
  const ext = MIME_EXT[mime];
  return ext ? `${submissionId}/${slot}.${ext}` : null;
}

/**
 * 선택된 슬롯만 customer-uploads 버킷에 업로드하고 경로 맵을 반환.
 * 업로드 실패 또는 허용 외 MIME이면 throw — 호출 측(폼)이 사용자에게 안내.
 */
export async function uploadSitePhotos(
  submissionId: string,
  files: Partial<Record<PhotoSlot, File>>,
): Promise<Partial<Record<PhotoSlot, string>>> {
  const supabase = createSupabaseBrowserClient();
  const out: Partial<Record<PhotoSlot, string>> = {};

  for (const [slot, file] of Object.entries(files) as [PhotoSlot, File][]) {
    if (!file) continue;

    const path = buildPhotoPath(submissionId, slot, file.type);
    if (!path) throw new Error("이미지는 JPG·PNG·WEBP만 업로드할 수 있습니다");

    const { error } = await supabase.storage
      .from("customer-uploads")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw new Error("사진 업로드에 실패했습니다");

    out[slot] = path;
  }

  return out;
}
