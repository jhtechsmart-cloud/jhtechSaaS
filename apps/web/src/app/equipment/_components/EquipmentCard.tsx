import Image from "next/image";
import Link from "next/link";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";

// 카탈로그 카드 — 대표사진 + 이름·모델·카테고리. 모델/식별자는 mono.
export function EquipmentCard({ item }: { item: EquipmentPublic }) {
  const cover = item.photos[0];
  return (
    <Link
      href={`/equipment/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-bg transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full bg-surface-2">
        {cover ? (
          <Image
            src={publicImageUrl(cover)}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-small text-muted">
            이미지 없음
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-h2 font-medium text-text">{item.name}</h2>
        {item.model && <span className="font-mono text-small text-muted">{item.model}</span>}
        {item.category && <span className="text-small text-muted">{item.category}</span>}
      </div>
    </Link>
  );
}
