import { notFound } from "next/navigation";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { getConsumable } from "@/lib/consumables/queries";
import { listEquipment, listCategoryTree } from "@/lib/equipment/queries";
import { scopeSelectableOptions } from "@/lib/equipment/category-tree";
import { updateConsumable } from "@/lib/consumables/actions";
import type { ConsumableFormValues } from "@/lib/consumables/schema";
import { ConsumableForm } from "../../_components/ConsumableForm";
import { signOut } from "@/app/login/actions";

export default async function EditConsumablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">소모품 관리 권한(consumables.manage)이 필요합니다.</p>
        <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
      </main>
    );
  }

  // 세 쿼리를 병렬로 실행 — getConsumable·listEquipment·listCategoryTree 모두 독립적
  const [consumable, equipmentAll, categoryTree] = await Promise.all([
    getConsumable(id),
    listEquipment(),
    listCategoryTree(),
  ]);
  if (!consumable) notFound();

  const active = equipmentAll.filter((e) => e.status === "active");
  const catalog = active.map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));
  // taxonomy 드롭다운: 분류 트리에서 소모품 범위 선택 옵션 구성
  const categoryOptions = scopeSelectableOptions(categoryTree);

  const scopesRaw = (consumable as { consumable_scope?: unknown[] }).consumable_scope ?? [];
  const scopes = (scopesRaw as Array<Record<string, unknown>>).map((s) => ({
    id: (s.id as string) ?? "",
    category_id: (s.category_id as string) ?? "",
    equipment_id: (s.equipment_id as string) ?? "",
  }));

  const priceRaw = (consumable as { price?: number | string | null }).price;
  const values: ConsumableFormValues = {
    name: (consumable as { name: string }).name,
    unit: (consumable as { unit?: string | null }).unit ?? "",
    sku: (consumable as { sku?: string | null }).sku ?? "",
    price: priceRaw === null || priceRaw === undefined ? "" : String(priceRaw),
    note: (consumable as { note?: string | null }).note ?? "",
    status: (consumable as { status: "active" | "inactive" }).status,
    scopes,
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">소모품 수정</h1>
      <ConsumableForm mode="edit" id={id} onSubmit={updateConsumable} catalog={catalog} categoryOptions={categoryOptions} consumable={values} />
    </section>
  );
}
