"use client";
import { useEffect, useState } from "react";
import { AS_PHOTO_SLOTS, type AsPhotoSlot } from "@/lib/service-requests/schema";
import { AS_PHOTO_SLOT_LABELS } from "@/lib/service-requests/upload";
import { FileDropCard } from "@/components/ui/FileDropCard";

// 증상사진 3슬롯 — 선택+로컬 미리보기. 모바일은 카메라 직행(capture). 업로드는 제출 시(고아 없음).
// UI는 슬롯별 공통 드롭존 카드(FileDropCard). 콜백 시그니처·capture는 기존 그대로.
export function AsPhotoUploader({
  onChange,
}: {
  onChange: (files: Partial<Record<AsPhotoSlot, File>>) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<AsPhotoSlot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<AsPhotoSlot, string>>>({});

  useEffect(
    () => () => {
      Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u));
    },
    [previews],
  );

  function pick(slot: AsPhotoSlot, file?: File) {
    const next = { ...files };
    const nextPrev = { ...previews };
    if (nextPrev[slot]) URL.revokeObjectURL(nextPrev[slot]!);
    if (file) {
      next[slot] = file;
      nextPrev[slot] = URL.createObjectURL(file);
    } else {
      delete next[slot];
      delete nextPrev[slot];
    }
    setFiles(next);
    setPreviews(nextPrev);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-medium text-muted">증상 사진 (선택, 최대 3장)</legend>
      <div className="grid grid-cols-3 gap-3">
        {AS_PHOTO_SLOTS.map((slot) => {
          const url = previews[slot];
          return (
            <FileDropCard
              key={slot}
              label={AS_PHOTO_SLOT_LABELS[slot]}
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              preview={url ? { kind: "image", url } : null}
              onPick={(f) => pick(slot, f)}
              onClear={() => pick(slot, undefined)}
              hint="jpg · png · webp"
            />
          );
        })}
      </div>
    </fieldset>
  );
}
