import { requireEquipmentManage } from "@/lib/auth/guard";
import { listCategoryTree } from "@/lib/equipment/queries";
import { EquipmentForm } from "../_components/EquipmentForm";

export default async function NewEquipmentPage() {
  // #243: 가드 반환값 검사 — forbidden이면 폼을 렌더하지 않는다(기존엔 반환 무시로 폼 노출).
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">장비 관리 권한(equipment.manage)이 필요합니다.</p>
      </div>
    );
  }
  const categories = await listCategoryTree();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 추가</h1>
      <EquipmentForm mode="create" categories={categories} />
    </section>
  );
}
