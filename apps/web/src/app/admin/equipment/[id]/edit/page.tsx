import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EquipmentForm } from "../../_components/EquipmentForm";
import type { EquipmentFormValues } from "@/lib/equipment/schema";

// Next 16: params는 Promise.
export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("name, model, category, base_price, status, youtube_url")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const initial: EquipmentFormValues = {
    name: data.name,
    model: data.model ?? "",
    category: data.category ?? "",
    base_price: Number(data.base_price),
    status: data.status === "inactive" ? "inactive" : "active",
    youtube_url: data.youtube_url ?? "",
    // P3 동적 필드 — DB에서 별도 로드(T7/T8). 여기서는 빈 배열로 초기화.
    specs: [],
    photos: [],
    options: [],
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 수정</h1>
      <EquipmentForm mode="edit" id={id} initial={initial} />
    </section>
  );
}
