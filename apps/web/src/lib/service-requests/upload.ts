import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AsPhotoSlot } from "./schema";

// 허용 MIME → 확장자. customer-uploads anon 정책 정규식(jpg|png|webp)과 일치.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const AS_PHOTO_SLOT_LABELS: Record<AsPhotoSlot, string> = {
  as_photo_1: "증상 사진 1",
  as_photo_2: "증상 사진 2",
  as_photo_3: "증상 사진 3",
};

// 버킷-상대 경로 `<submissionId>/<slot>.<ext>` — anon INSERT 정책·RPC 정규식과 동일 형식.
export function buildAsPhotoPath(submissionId: string, slot: AsPhotoSlot, mime: string): string | null {
  const ext = MIME_EXT[mime];
  return ext ? `${submissionId}/${slot}.${ext}` : null;
}

// 선택 슬롯만 업로드(제출 시 — 고아 없음). 실패 시 throw → 폼이 사용자에게 안내.
export async function uploadAsPhotos(
  submissionId: string,
  files: Partial<Record<AsPhotoSlot, File>>,
): Promise<Partial<Record<AsPhotoSlot, string>>> {
  const supabase = createSupabaseBrowserClient();
  const out: Partial<Record<AsPhotoSlot, string>> = {};
  for (const [slot, file] of Object.entries(files) as [AsPhotoSlot, File][]) {
    if (!file) continue;
    const path = buildAsPhotoPath(submissionId, slot, file.type);
    if (!path) throw new Error("이미지는 JPG·PNG·WEBP만 업로드할 수 있습니다");
    const { error } = await supabase.storage
      .from("customer-uploads")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("사진 업로드에 실패했습니다");
    out[slot] = path;
  }
  return out;
}
