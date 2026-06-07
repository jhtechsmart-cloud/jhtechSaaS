"use client";
import { previewTotals, type QuoteRow } from "@/lib/quotes/form";

// 견적 라인 에디터 + 실시간 합계 — QuoteForm(의뢰)·ManualQuoteForm(수기) 공유.
// 행 상태는 부모가 소유(items/options + setter). 합계는 previewTotals(클라 미리보기).
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const emptyRow = (): QuoteRow => ({ name: "", unitPrice: 0, quantity: 1 });
const numOrNaN = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

export function QuoteLinesEditor({
  items,
  setItems,
  options,
  setOptions,
  disabled,
}: {
  items: QuoteRow[];
  setItems: (r: QuoteRow[]) => void;
  options: QuoteRow[];
  setOptions: (r: QuoteRow[]) => void;
  disabled: boolean;
}) {
  const totals = previewTotals(items, options);
  return (
    <div className="flex flex-col gap-6">
      <LineSection title="장비" rows={items} setRows={setItems} disabled={disabled} />
      <LineSection title="옵션" rows={options} setRows={setOptions} disabled={disabled} />
      <div className="rounded-md border border-border bg-surface p-4">
        <TotalRow label="공급가" value={totals.supplyPrice} />
        <TotalRow label="세액 (10%)" value={totals.taxPrice} />
        <div className="my-2 border-t border-border" />
        <TotalRow label="합계" value={totals.total} strong />
      </div>
    </div>
  );
}

function LineSection({
  title,
  rows,
  setRows,
  disabled,
}: {
  title: string;
  rows: QuoteRow[];
  setRows: (r: QuoteRow[]) => void;
  disabled: boolean;
}) {
  function update(i: number, patch: Partial<QuoteRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">{title}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const lineTotal =
            (Number.isFinite(r.unitPrice) ? r.unitPrice : 0) *
            (Number.isFinite(r.quantity) ? r.quantity : 0);
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`${title} 이름`}
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={disabled}
                placeholder="이름"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
              />
              <input
                aria-label={`${title} 단가`}
                type="number"
                value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""}
                onChange={(e) => update(i, { unitPrice: numOrNaN(e.target.value) })}
                disabled={disabled}
                placeholder="단가"
                className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
              />
              <input
                aria-label={`${title} 수량`}
                type="number"
                value={Number.isFinite(r.quantity) ? r.quantity : ""}
                onChange={(e) => update(i, { quantity: numOrNaN(e.target.value) })}
                disabled={disabled}
                placeholder="수량"
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
              />
              <span className="w-32 shrink-0 text-right font-mono tabular-nums text-small text-muted">
                {won(lineTotal)}
              </span>
              <button
                type="button"
                aria-label={`${title} 행 삭제`}
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
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
          onClick={() => setRows([...rows, emptyRow()])}
          disabled={disabled}
          className="self-start text-small font-medium text-accent hover:underline"
        >
          + {title} 추가
        </button>
      </div>
    </section>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-body ${strong ? "font-semibold text-text" : "text-muted"}`}>{label}</span>
      <span
        className={`font-mono tabular-nums ${strong ? "text-h2 font-semibold text-text" : "text-body text-text"}`}
      >
        {won(value)}
      </span>
    </div>
  );
}
