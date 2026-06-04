import { Suspense } from "react";
import { requireCustomersEdit } from "@/lib/auth/guard";
import { listAssignableStaff } from "@/lib/customers/queries";
import { listEquipment } from "@/lib/equipment/queries";
import type { Equipment } from "@jhtechsaas/shared";
import { NewCustomerClient } from "./NewCustomerClient";
import { signOut } from "@/app/login/actions";

type StaffItem = { id: string; name: string };
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// 서버 컴포넌트 — 담당자·카탈로그 fetch 후 클라이언트 래퍼에 전달.
// mode 읽기(useSearchParams)는 클라이언트 컴포넌트에서 수행.
// ⚠️ admin/layout은 equipment.manage 전용 가드 → customers.edit 별도 확인 필수.
export default async function NewCustomerPage() {
  const access = await requireCustomersEdit();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          고객 관리 권한(customers.edit)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

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
