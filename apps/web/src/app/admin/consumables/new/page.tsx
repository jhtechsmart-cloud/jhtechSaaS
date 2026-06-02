import { requireConsumablesManage } from "@/lib/auth/guard";
import { listEquipment, listCategoryTree } from "@/lib/equipment/queries";
import { scopeSelectableOptions } from "@/lib/equipment/category-tree";
import { NewConsumableClient } from "./NewConsumableClient";
import { signOut } from "@/app/login/actions";

export default async function NewConsumablePage() {
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
  const equipmentAll = await listEquipment();
  const active = equipmentAll.filter((e) => e.status === "active");
  const catalog = active.map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));
  // taxonomy 드롭다운: 분류 트리에서 소모품 범위 선택 옵션 구성
  const categoryOptions = scopeSelectableOptions(await listCategoryTree());
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">소모품 추가</h1>
      <NewConsumableClient catalog={catalog} categoryOptions={categoryOptions} />
    </section>
  );
}
