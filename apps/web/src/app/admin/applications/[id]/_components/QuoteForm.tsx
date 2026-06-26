"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { DEFAULT_QUOTE_NOTES, defaultSpecSelection, normalizeQuoteNotes } from "@jhtechsaas/shared";
import { matchEquipmentName } from "@/lib/quotes/equipment-match";
import {
  availableIncludedNames,
  buildQuoteOptions,
  formPreviewTotals,
  itemRowsToLines,
  mainEquipmentSpecs,
  rowsToQuoteInput,
  specSelectionBudget,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { createQuoteAction } from "@/lib/quotes/actions";
import { QuoteLinesEditor } from "@/app/admin/_components/QuoteLinesEditor";
import { QuoteNotesEditor } from "@/app/admin/_components/QuoteNotesEditor";
import { SpecSelectionEditor } from "@/app/admin/_components/SpecSelectionEditor";
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
import { QuoteEditModeBanner } from "@/app/admin/_components/QuoteEditModeBanner";
import { QuoteBottomBar } from "@/app/admin/_components/QuoteBottomBar";

// 저장된 견적 장비줄 → 폼 장비행. 저장된 equipmentId가 있으면 그대로 쓰고(카탈로그에 존재할 때),
// 없으면 이름매칭으로 복원(구 견적 하위호환), 그래도 없으면 직접입력.
function toItemRows(initial: QuoteRow[] | undefined, catalog: QuoteCatalogItem[]): ItemRow[] {
  if (!initial || initial.length === 0) return [{ equipmentId: "", name: "", unitPrice: 0, quantity: 1 }];
  return initial.map((it) => {
    const byId = it.equipmentId ? catalog.find((c) => c.id === it.equipmentId) : undefined;
    const eq = byId ?? matchEquipmentName(it.name, catalog);
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
  initialSpecSelection,
  initialNotes,
  contextSlot,
}: {
  applicationId: string;
  catalog: QuoteCatalogItem[];
  initialItems?: QuoteRow[];
  initialOptions?: QuoteRow[];
  initialSpecSelection?: string[];
  initialNotes?: string[];
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
  // 견적서 사양 선택 — 재발행이면 저장값, 새 견적이면 메인 장비의 기본(pdf:true, 없으면 전체).
  const [specSelection, setSpecSelection] = useState<string[]>(
    () => initialSpecSelection ?? defaultSpecSelection(mainEquipmentSpecs(toItemRows(initialItems, catalog), catalog)),
  );
  // 특기사항 — 재발행이면 저장값, 새 견적이면 기본 2줄. 편집한 줄이 발행 PDF에 반영된다.
  const [notes, setNotes] = useState<string[]>(() => initialNotes ?? [...DEFAULT_QUOTE_NOTES]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 메인 장비가 바뀌면 그 장비의 기본 사양으로 재설정(사양이 따라오게).
  // mainEqId(첫 카탈로그 장비 id)로 catalog를 직접 조회 → 의존성에 items 불필요(수량만 바꿔도 안 도는다).
  const mainEqId = items.find((i) => i.equipmentId)?.equipmentId ?? "";
  const prevEqRef = useRef(mainEqId);
  useEffect(() => {
    if (prevEqRef.current !== mainEqId) {
      prevEqRef.current = mainEqId;
      const specs = mainEqId ? (catalog.find((c) => c.id === mainEqId)?.specs ?? []) : [];
      setSpecSelection(defaultSpecSelection(specs));
    }
  }, [mainEqId, catalog]);

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
      const res = await createQuoteAction(applicationId, { items: cItems, options: cOptions, status, specSelection, notes: normalizeQuoteNotes(notes) });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <QuoteEditModeBanner />
      <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[1fr_320px] lg:pb-0">
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
        <SpecSelectionEditor
          specs={mainEquipmentSpecs(items, catalog)}
          selected={specSelection}
          setSelected={setSpecSelection}
          max={specSelectionBudget(items, options, includedDeselected, catalog, specSelection).max}
          disabled={pending}
        />
        <QuoteNotesEditor notes={notes} setNotes={setNotes} disabled={pending} />
      </div>
      <QuoteTotalsAside totals={totals}>
        {error && <p className="text-small text-danger">{error}</p>}
        <Link href={`/admin/applications/${applicationId}`}
          className="rounded-md border border-border px-4 py-2 text-center text-small font-medium text-muted hover:text-text">취소</Link>
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
      </div>
      {/* lg 미만: 하단 고정 합계 바(데스크톱은 우측 sticky 요약) — 같은 totals·submit 재사용 */}
      <QuoteBottomBar
        supplyPrice={totals.supplyPrice}
        pending={pending}
        onSave={() => submit("draft")}
        onIssue={() => submit("issued")}
        error={error}
      />
    </div>
  );
}
