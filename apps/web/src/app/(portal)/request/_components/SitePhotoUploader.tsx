"use client";
import { useEffect, useState } from "react";
import { type PhotoSlot } from "@/lib/applications/schema";
import { PHOTO_SLOT_LABELS } from "@/lib/applications/upload";

const GROUPS: { title: string; slots: PhotoSlot[] }[] = [
  { title: "외부 전경(선택)", slots: ["ext_entrance", "ext_building"] },
  { title: "내부 전경(선택)", slots: ["int_entrance", "int_location"] },
];

// 현장사진 4슬롯 — 선택+로컬 미리보기. 선택 File을 부모에 콜백(업로드는 제출 시 — Task 8).
export function SitePhotoUploader({
  onChange,
}: {
  onChange: (files: Partial<Record<PhotoSlot, File>>) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});

  // objectURL 누수 방지.
  useEffect(
    () => () => {
      Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u));
    },
    [previews],
  );

  function pick(slot: PhotoSlot, file?: File) {
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
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="flex flex-col gap-3">
          <legend className="text-small font-medium text-muted">{g.title}</legend>
          <div className="grid grid-cols-2 gap-3">
            {g.slots.map((slot) => (
              <label key={slot} className="flex flex-col gap-1 text-small text-muted">
                {PHOTO_SLOT_LABELS[slot]}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => pick(slot, e.target.files?.[0])}
                  className="text-small"
                />
                {previews[slot] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[slot]}
                    alt={PHOTO_SLOT_LABELS[slot]}
                    className="mt-1 aspect-[4/3] w-full rounded-sm object-cover"
                  />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
