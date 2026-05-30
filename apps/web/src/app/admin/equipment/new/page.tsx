import { EquipmentForm } from "../_components/EquipmentForm";

export default function NewEquipmentPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 추가</h1>
      <EquipmentForm mode="create" />
    </section>
  );
}
