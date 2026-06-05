import type { Metadata } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { EquipmentCard } from "./_components/EquipmentCard";

export const metadata: Metadata = {
  title: "장비 카탈로그",
  description: "(주)재현테크 UV 프린터·커팅기 카탈로그.",
};

// 공개 카탈로그 — 동적 SSR(equipment_public, active만). 카테고리 필터는 후속.
export default async function EquipmentCatalogPage() {
  const items = await listPublicEquipment();
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="text-display font-semibold text-text">장비 카탈로그</h1>
        <p className="text-body text-muted">
          원하는 장비를 선택해 상세 정보를 확인하고 견적을 요청하세요.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-body text-muted shadow-card">
          등록된 장비가 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <EquipmentCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
