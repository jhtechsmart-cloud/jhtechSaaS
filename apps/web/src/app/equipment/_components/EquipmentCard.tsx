import Image from "next/image";
import Link from "next/link";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";

// 카탈로그 카드 — 사진·이름·모델·카테고리 + [상세정보][장비선택] 2버튼.
export function EquipmentCard({ item }: { item: EquipmentPublic }) {
  const cover = item.photos[0];
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg">
      <Link href={`/equipment/${item.id}`} className="relative aspect-[4/3] w-full bg-surface-2">
        {cover ? (
          <Image
            src={publicImageUrl(cover)}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            // 가로로 긴 프린터 사진이 잘리지 않도록 전체가 보이게 맞춤(letterbox는 bg-surface-2).
            className="object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-small text-muted">이미지 없음</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="text-h2 font-medium text-text">{item.name}</h2>
        {item.model && <span className="font-mono text-small text-muted">{item.model}</span>}
        {item.category && <span className="text-small text-muted">{item.category}</span>}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/equipment/${item.id}`}
            className="flex-1 rounded-md border border-border px-3 py-2 text-center text-small font-medium text-text hover:border-accent"
          >
            상세정보
          </Link>
          <Link
            href={`/request?equipment_id=${item.id}`}
            className="flex-1 rounded-md bg-accent px-3 py-2 text-center text-small font-medium text-white hover:opacity-90"
          >
            장비선택
          </Link>
        </div>
      </div>
    </div>
  );
}
