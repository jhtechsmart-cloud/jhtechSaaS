import { Suspense } from "react";
import { listAssignableStaff } from "@/lib/customers/queries";
import { listEquipment } from "@/lib/equipment/queries";
import type { Equipment } from "@jhtechsaas/shared";
import { NewCustomerClient } from "./NewCustomerClient";

type StaffItem = { id: string; name: string };
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// 서버 컴포넌트 — 담당자·카탈로그 fetch 후 클라이언트 래퍼에 전달.
// mode 읽기(useSearchParams)는 클라이언트 컴포넌트에서 수행.
export default async function NewCustomerPage() {
  const [staffRaw, equipmentAll] = await Promise.all([
    listAssignableStaff(),
    listEquipment(),
  ]);

  const staff: StaffItem[] = staffRaw.map((s) => ({ id: s.id, name: s.name }));
  // active 장비만 카탈로그로 제공
  const catalog: CatalogItem[] = equipmentAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">고객 추가</h1>
      {/* Suspense: useSearchParams가 동작하려면 필요(App Router) */}
      <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded-md bg-surface-2" />}>
        <NewCustomerClient staff={staff} catalog={catalog} />
      </Suspense>
    </section>
  );
}
