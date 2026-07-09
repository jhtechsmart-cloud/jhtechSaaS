import type { Metadata } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { groupByCategory } from "@/lib/equipment/group";
import { EquipmentCard } from "./_components/EquipmentCard";

export const metadata: Metadata = {
  title: "장비 카탈로그",
  description: "(주)재현테크 UV 프린터·커팅기 카탈로그.",
};

// 공개 카탈로그 — 동적 SSR(equipment_public, active만). 분류별 접이식 섹션(native details, 모바일 친화).
// 그리드: 모바일 1 → 480px 2 → 태블릿 3 → 데스크톱 4.
export default async function EquipmentCatalogPage() {
  const items = await listPublicEquipment();
  const groups = groupByCategory(items);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-2 sm:mb-8">
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
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <details key={g.category} open className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <span className="flex items-center gap-2 text-h2 font-semibold text-text">
                  {g.category}
                  <span className="text-body font-normal text-muted">{g.items.length}</span>
                </span>
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <ul className="grid grid-cols-1 gap-4 border-t border-border p-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <EquipmentCard item={item} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
