import { requireEquipmentManage } from "@/lib/auth/guard";
import { listCategoryTree } from "@/lib/equipment/queries";
import { EquipmentForm } from "../_components/EquipmentForm";

export default async function NewEquipmentPage() {
  await requireEquipmentManage();
  const categories = await listCategoryTree();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 추가</h1>
      <EquipmentForm mode="create" categories={categories} />
    </section>
  );
}
