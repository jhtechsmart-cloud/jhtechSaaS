import { notFound } from "next/navigation";
import { parseSpecs } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EquipmentForm } from "../../_components/EquipmentForm";
import type { EquipmentFormValues } from "@/lib/equipment/schema";
import { listCategoryTree } from "@/lib/equipment/queries";
import { requireEquipmentManage } from "@/lib/auth/guard";

// Next 16: params는 Promise.
export default async function EditEquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // new/page.tsx와 대칭적으로 equipment.manage 권한 검증(admin 레이아웃 게이트와 이중 방어)
  await requireEquipmentManage();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("name, model, category_id, base_price, status, highlights, youtube_urls, specs, photos, quote_banner_top, quote_banner_bottom")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const { data: optionRows } = await supabase
    .from("equipment_option")
    .select("kind, name, price")
    .eq("equipment_id", id)
    .order("id", { ascending: true });

  const categories = await listCategoryTree();

  const initial: EquipmentFormValues = {
    name: data.name,
    model: data.model ?? "",
    category_id: data.category_id ?? "",
    base_price: Number(data.base_price),
    status: data.status,
    highlights: (data.highlights ?? []) as string[],
    youtube_urls: (data.youtube_urls ?? []) as string[],
    specs: parseSpecs(data.specs),
    photos: (data.photos ?? []) as string[],
    options: (optionRows ?? []).map((o) => ({
      kind: o.kind as "included" | "extra",
      name: o.name,
      price: Number(o.price),
    })),
    quote_banner_top: data.quote_banner_top ?? "",
    quote_banner_bottom: data.quote_banner_bottom ?? "",
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 수정</h1>
      <EquipmentForm mode="edit" id={id} initial={initial} categories={categories} />
    </section>
  );
}
