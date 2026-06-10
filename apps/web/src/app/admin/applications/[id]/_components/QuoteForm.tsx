"use client";
import { useState, useTransition, type ReactNode } from "react";
import { matchEquipmentName } from "@/lib/quotes/equipment-match";
import {
  availableIncludedNames,
  buildQuoteOptions,
  formPreviewTotals,
  itemRowsToLines,
  rowsToQuoteInput,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { createQuoteAction } from "@/lib/quotes/actions";
import { QuoteLinesEditor } from "@/app/admin/_components/QuoteLinesEditor";
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
import { QuoteEditModeBanner } from "@/app/admin/_components/QuoteEditModeBanner";

// 저장된 견적 장비줄(이름) → 폼 장비행(카탈로그 이름매칭으로 equipmentId 복원, 미매칭은 직접입력).
function toItemRows(initial: QuoteRow[] | undefined, catalog: QuoteCatalogItem[]): ItemRow[] {
  if (!initial || initial.length === 0) return [{ equipmentId: "", name: "", unitPrice: 0, quantity: 1 }];
  return initial.map((it) => {
    const eq = matchEquipmentName(it.name, catalog);
    return { equipmentId: eq?.id ?? "", name: it.name, unitPrice: it.unitPrice, quantity: it.quantity };
  });
}

// 견적 작성 폼 — 장비는 카탈로그 선택, 포함옵션 체크박스, 추가옵션 자유입력.
// 금액 미리보기는 클라, 저장 권위는 서버 RPC(createQuoteAction).
export function QuoteForm({
  applicationId,
  catalog,
  initialItems,
  initialOptions,
  contextSlot,
}: {
  applicationId: string;
  catalog: QuoteCatalogItem[];
  initialItems?: QuoteRow[];
  initialOptions?: QuoteRow[];
  contextSlot?: ReactNode;
}) {
  const [items, setItems] = useState<ItemRow[]>(() => toItemRows(initialItems, catalog));
  const [options, setOptions] = useState<QuoteRow[]>(() => (initialOptions ?? []).filter((o) => o.kind !== "included"));
  // 재발행 프리필: 매칭 장비의 포함옵션 중 저장 안 된 것 = 해제 상태로 복원(새 견적은 전체 포함).
  const [includedDeselected, setIncludedDeselected] = useState<string[]>(() => {
    const saved = (initialOptions ?? []).filter((o) => o.kind === "included").map((o) => o.name);
    if (!initialOptions || !initialOptions.some((o) => o.kind === "included")) return [];
    return availableIncludedNames(toItemRows(initialItems, catalog), catalog).filter((n) => !saved.includes(n));
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 실시간 합계 미리보기(폼 상태 기반, 표시 전용 — 저장 권위는 서버 RPC).
  const totals = formPreviewTotals(items, options, includedDeselected, catalog);

  function submit(status: "draft" | "issued") {
    const checkedIncluded = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n));
    const { items: cItems, options: cOptions } = rowsToQuoteInput(
      itemRowsToLines(items),
      buildQuoteOptions(checkedIncluded, options),
    );
    const msg = validateQuoteForm(cItems, cOptions);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createQuoteAction(applicationId, { items: cItems, options: cOptions, status });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <QuoteEditModeBanner />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        {contextSlot}
        <QuoteLinesEditor
          catalog={catalog}
          items={items}
          setItems={setItems}
          includedDeselected={includedDeselected}
          setIncludedDeselected={setIncludedDeselected}
          options={options}
          setOptions={setOptions}
          disabled={pending}
        />
      </div>
      <QuoteTotalsAside totals={totals}>
        {error && <p className="text-small text-danger">{error}</p>}
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
      </div>
    </div>
  );
}
