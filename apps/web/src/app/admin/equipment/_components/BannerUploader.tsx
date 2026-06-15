"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { validateImageFile, publicImageUrl } from "@/lib/equipment/images";

// DB CHECK가 허용하는 확장자(견적서 장비 자산 경로). 그 외는 저장 시 CHECK 위반 → 업로드 전 거부.
const ALLOWED_BANNER_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

type Props = {
  equipmentId: string;
  slot: "name" | "image";
  value: string;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void; // 폼이 저장 가드
};

// 견적서 장비 자산 단일 업로더 — equipment-images/equipment/{id}/device-{slot}.{ext}. 덮어쓰기(upsert).
export function BannerUploader({
  equipmentId,
  slot,
  value,
  onChange,
  onUploadingChange,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    // 형식·크기 검증(이미지 공통 헬퍼) — {ok,error} 형태.
    const check = validateImageFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    // CHECK 허용 확장자 외(예: gif) 조기 차단 — 저장 단계 CHECK 위반 방지.
    if (!ALLOWED_BANNER_EXT.has(ext)) {
      setError(`${file.name}: 지원하지 않는 형식`);
      return;
    }
    setError(null);
    onUploadingChange(true);
    try {
      const path = `equipment/${equipmentId}/device-${slot}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from("equipment-images")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      onChange(path);
    } finally {
      onUploadingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-small text-muted">
        {slot === "name" ? "장비 네임 로고 (견적서 좌하단)" : "장비 이미지 (견적서 우하단)"}
      </span>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicImageUrl(value)}
          alt={slot === "name" ? "장비 네임" : "장비 이미지"}
          className="w-full rounded-sm border border-border"
        />
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
        className="text-small"
      />
      {error && <span className="text-small text-danger">{error}</span>}
    </div>
  );
}
