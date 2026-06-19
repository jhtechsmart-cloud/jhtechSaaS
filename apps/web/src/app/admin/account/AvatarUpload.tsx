"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { setAvatarAction, removeAvatarAction } from "@/lib/account/avatar-actions";
import { UserAvatar } from "@/app/admin/_components/UserAvatar";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// 계정 설정 프로필 사진 업로드 — 브라우저 클라(본인 세션·RLS)로 avatars/<uid>/<ts>.<ext> 업로드 후
// setAvatarAction이 profiles.avatar_url 저장(admin). 파일명은 고유(캐시 무효화).
export function AvatarUpload({
  userId,
  name,
  initialUrl,
}: {
  userId: string;
  name: string | null;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setError(null);
    const ext = EXT[file.type];
    if (!ext) {
      setError("JPG·PNG·WEBP 이미지만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("이미지 크기는 2MB 이하여야 합니다.");
      return;
    }
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const path = `${userId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        setError("업로드에 실패했습니다.");
        return;
      }
      const res = await setAvatarAction(path);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const pub = supabase.storage.from("avatars").getPublicUrl(path);
      setUrl(pub.data.publicUrl);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeAvatarAction();
      if (res?.error) {
        setError(res.error);
        return;
      }
      setUrl(null);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar imageUrl={url} name={name} size={64} variant="soft" />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={pick}
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white disabled:opacity-50"
          >
            {pending ? "처리 중…" : url ? "사진 변경" : "사진 업로드"}
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-small text-muted hover:text-danger disabled:opacity-50"
            >
              제거
            </button>
          )}
        </div>
        <p className="text-micro text-muted">JPG·PNG·WEBP, 2MB 이하</p>
        {error && <p className="text-small text-danger">{error}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
    </div>
  );
}
