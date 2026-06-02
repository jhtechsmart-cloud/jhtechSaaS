"use client";
import { useState } from "react";
import { ConsumableForm } from "../_components/ConsumableForm";
import { createConsumable } from "@/lib/consumables/actions";

type CatalogItem = { id: string; name: string; model: string | null };

export function NewConsumableClient({ catalog, categories }: { catalog: CatalogItem[]; categories: string[] }) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <ConsumableForm mode="create" id={id} onSubmit={createConsumable} catalog={catalog} categories={categories} />
  );
}
