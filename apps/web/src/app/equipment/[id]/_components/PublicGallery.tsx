"use client";
import { useState } from "react";
import Image from "next/image";
import { publicImageUrl } from "@/lib/equipment/images";

// 상세 갤러리 — 대표(첫장) 큰 이미지 + 썸네일 전환. 사진 0장이면 placeholder.
export function PublicGallery({ photos, name }: { photos: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-surface-2 text-body text-muted">
        이미지 없음
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-surface-2">
        <Image
          src={publicImageUrl(photos[active])}
          alt={`${name} 사진 ${active + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain"
          priority
        />
      </div>
      {photos.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`사진 ${i + 1} 보기`}
                aria-current={i === active}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-sm border ${
                  i === active ? "border-accent" : "border-border"
                }`}
              >
                <Image src={publicImageUrl(p)} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
