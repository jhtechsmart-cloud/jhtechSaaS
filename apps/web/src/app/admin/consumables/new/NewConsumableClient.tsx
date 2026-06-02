"use client";
import { useState } from "react";
import { ConsumableForm } from "../_components/ConsumableForm";
import { createConsumable } from "@/lib/consumables/actions";
import { type OptGroup } from "@/lib/equipment/category-tree";

type CatalogItem = { id: string; name: string; model: string | null };

export function NewConsumableClient({ catalog, categoryOptions }: { catalog: CatalogItem[]; categoryOptions: OptGroup[] }) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <ConsumableForm mode="create" id={id} onSubmit={createConsumable} catalog={catalog} categoryOptions={categoryOptions} />
  );
}
