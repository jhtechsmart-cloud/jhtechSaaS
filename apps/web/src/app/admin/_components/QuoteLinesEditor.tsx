"use client";
import {
  availableIncludedNames,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";

// 견적 라인 에디터 — 장비는 카탈로그에서 선택(직접입력 폴백), 포함옵션은 체크박스(기본 전체),
// 추가옵션은 자유 입력. QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 줄별 소계만 표시(전체 합계는 오른쪽 패널 QuoteTotalsAside).
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const numOrNaN = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
const emptyExtra = (): QuoteRow => ({ name: "", unitPrice: 0, quantity: 1 });
const emptyItem = (): ItemRow => ({ equipmentId: "", name: "", unitPrice: 0, quantity: 1 });

export function QuoteLinesEditor({
  catalog,
  items,
  setItems,
  includedDeselected,
  setIncludedDeselected,
  options,
  setOptions,
  disabled,
}: {
  catalog: QuoteCatalogItem[];
  items: ItemRow[];
  setItems: (r: ItemRow[]) => void;
  includedDeselected: string[];
  setIncludedDeselected: (n: string[]) => void;
  options: QuoteRow[];
  setOptions: (r: QuoteRow[]) => void;
  disabled: boolean;
}) {
  const availableIncluded = availableIncludedNames(items, catalog);

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  // 장비 선택 시 표시명·기본공급가 자동 채움(단가는 이후 수정 가능). "" = 직접 입력.
  function selectEquipment(i: number, equipmentId: string) {
    const eq = catalog.find((c) => c.id === equipmentId);
    updateItem(i, eq ? { equipmentId, name: eq.name, unitPrice: eq.basePrice } : { equipmentId: "", name: "", unitPrice: 0 });
  }
  function toggleIncluded(name: string, checked: boolean) {
    setIncludedDeselected(checked ? includedDeselected.filter((n) => n !== name) : [...includedDeselected, name]);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 장비 — 카탈로그 선택 + 직접입력 */}
      <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
        <h2 className="mb-2 text-h2 font-medium text-text">장비</h2>
        <div className="flex flex-col gap-2">
          {items.map((r, i) => {
            const lineTotal = (Number.isFinite(r.unitPrice) ? r.unitPrice : 0) * (Number.isFinite(r.quantity) ? r.quantity : 0);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="장비 선택"
                  value={r.equipmentId}
                  onChange={(e) => selectEquipment(i, e.target.value)}
                  disabled={disabled}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
                >
                  <option value="">직접 입력</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ""}</option>
                  ))}
                </select>
                {r.equipmentId === "" && (
                  <input
                    aria-label="장비 이름"
                    value={r.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    disabled={disabled}
                    placeholder="장비명 직접 입력"
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
                  />
                )}
                <input
                  aria-label="장비 단가"
                  type="number"
                  value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""}
                  onChange={(e) => updateItem(i, { unitPrice: numOrNaN(e.target.value) })}
                  disabled={disabled}
                  placeholder="단가"
                  className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
                />
                <input
                  aria-label="장비 수량"
                  type="number"
                  value={Number.isFinite(r.quantity) ? r.quantity : ""}
                  onChange={(e) => updateItem(i, { quantity: numOrNaN(e.target.value) })}
                  disabled={disabled}
                  placeholder="수량"
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
                />
                <span className="w-32 shrink-0 text-right font-mono tabular-nums text-small text-muted">{won(lineTotal)}</span>
                <button
                  type="button"
                  aria-label="장비 행 삭제"
                  onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  disabled={disabled}
                  className="px-2 text-muted hover:text-danger"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setItems([...items, emptyItem()])}
            disabled={disabled}
            className="self-start text-small font-medium text-accent hover:underline"
          >
            + 장비 추가
          </button>
        </div>
      </section>

      {/* 포함 옵션 — 선택 장비의 기본 포함(단가 0). 체크 해제 = 견적서에서 제외. */}
      {availableIncluded.length > 0 && (
        <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-h2 font-medium text-text">포함 옵션</h2>
            <span className="text-micro text-muted">기본 전체 포함 · 해제 시 견적서에서 제외</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableIncluded.map((name) => (
              <label key={name} className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-text">
                <input
                  type="checkbox"
                  checked={!includedDeselected.includes(name)}
                  onChange={(e) => toggleIncluded(name, e.target.checked)}
                  disabled={disabled}
                />
                {name}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* 추가 옵션 — 별도 과금(자유 입력) */}
      <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
        <h2 className="mb-2 text-h2 font-medium text-text">추가 옵션</h2>
        <div className="flex flex-col gap-2">
          {options.map((r, i) => {
            const lineTotal = (Number.isFinite(r.unitPrice) ? r.unitPrice : 0) * (Number.isFinite(r.quantity) ? r.quantity : 0);
            const update = (patch: Partial<QuoteRow>) => setOptions(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
            return (
              <div key={i} className="flex items-center gap-2">
                <input aria-label="추가 옵션 이름" value={r.name} onChange={(e) => update({ name: e.target.value })} disabled={disabled} placeholder="옵션명"
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text" />
                <input aria-label="추가 옵션 단가" type="number" value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""} onChange={(e) => update({ unitPrice: numOrNaN(e.target.value) })} disabled={disabled} placeholder="단가"
                  className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
                <input aria-label="추가 옵션 수량" type="number" value={Number.isFinite(r.quantity) ? r.quantity : ""} onChange={(e) => update({ quantity: numOrNaN(e.target.value) })} disabled={disabled} placeholder="수량"
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
                <span className="w-32 shrink-0 text-right font-mono tabular-nums text-small text-muted">{won(lineTotal)}</span>
                <button type="button" aria-label="추가 옵션 행 삭제" onClick={() => setOptions(options.filter((_, idx) => idx !== i))} disabled={disabled}
                  className="px-2 text-muted hover:text-danger">×</button>
              </div>
            );
          })}
          <button type="button" onClick={() => setOptions([...options, emptyExtra()])} disabled={disabled}
            className="self-start text-small font-medium text-accent hover:underline">+ 추가 옵션</button>
        </div>
      </section>
    </div>
  );
}
