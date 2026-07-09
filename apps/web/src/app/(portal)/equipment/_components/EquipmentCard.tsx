import Image from "next/image";
import Link from "next/link";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";

// 카탈로그 카드 — 사진·이름·모델·카테고리 + [상세정보][장비선택] 2버튼.
export function EquipmentCard({ item }: { item: EquipmentPublic }) {
  const cover = item.photos[0];
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-shadow hover:shadow-card-hover">
      {/* 패딩(여백)을 둔 래퍼 — 여백 없는 원본 사진도 카드 가장자리에 닿지 않게 숨 쉬는 공간 확보.
          fill 이미지는 padding을 무시(inset:0)하므로, 안쪽 relative 박스를 positioning 컨텍스트로 둬
          이미지가 패딩 안쪽(content box)만 채우게 한다. */}
      <Link href={`/equipment/${item.id}`} className="block aspect-[4/3] w-full bg-surface-2 p-6">
        <div className="relative h-full w-full">
          {cover ? (
            <Image
              src={publicImageUrl(cover)}
              alt={item.name}
              fill
              sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              // 가로로 긴 프린터 사진이 잘리지 않도록 전체가 보이게 맞춤(letterbox는 bg-surface-2).
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-small text-muted">이미지 없음</div>
          )}
        </div>
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
