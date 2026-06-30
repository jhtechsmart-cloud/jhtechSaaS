"use client";
import {
  catalogIncluded,
  itemFinalUnit,
  type IncludedRow,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";

// 견적 라인 에디터 — 장비는 카탈로그에서 선택(직접입력 폴백). 장비마다 '장비 가격(기본가)' 입력 +
// 그 아래 포함옵션(이름·가격) 2열 편집. 우측에 '최종가(옵션 포함)=기본가+포함옵션 합' 읽기전용.
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 전체 합계는 우측 패널(QuoteTotalsAside).
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const numOrNaN = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
const emptyItem = (): ItemRow => ({ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] });

const emptyExtra = (): QuoteRow => ({ name: "", unitPrice: 0, quantity: 1 });

export function QuoteLinesEditor({
  catalog,
  items,
  setItems,
  options,
  setOptions,
  disabled,
}: {
  catalog: QuoteCatalogItem[];
  items: ItemRow[];
  setItems: (r: ItemRow[]) => void;
  options: QuoteRow[]; // 추가옵션(별도 과금) — 포함옵션과 별개
  setOptions: (r: QuoteRow[]) => void;
  disabled: boolean;
}) {
  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  // 장비 선택 시 표시명·기본가·포함옵션 자동 채움(이후 수정 가능). "" = 직접 입력.
  function selectEquipment(i: number, equipmentId: string) {
    const eq = catalog.find((c) => c.id === equipmentId);
    updateItem(
      i,
      eq
        ? { equipmentId, name: eq.name, unitPrice: eq.basePrice, included: catalogIncluded(catalog, equipmentId) }
        : { equipmentId: "", name: "", unitPrice: 0, included: [] },
    );
  }

  return (
    <div className="flex flex-col gap-6">
    <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">장비 · 포함옵션</h2>
      <div className="flex flex-col gap-4">
        {items.map((r, i) => {
          const finalUnit = itemFinalUnit(r);
          return (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
              {/* 장비 줄 */}
              <div className="flex flex-wrap items-center gap-2">
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
                {/* 장비 가격 = 기본가(편집). 최종가와 별개. */}
                <input
                  aria-label="장비 가격"
                  type="number"
                  value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""}
                  onChange={(e) => updateItem(i, { unitPrice: numOrNaN(e.target.value) })}
                  disabled={disabled}
                  placeholder="장비 가격"
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
                {/* 최종가(옵션 포함) 읽기전용 = 기본가 + 포함옵션 합 */}
                <span
                  title="기본가 + 포함옵션 합"
                  className="flex w-40 shrink-0 items-baseline justify-end gap-1 text-right text-micro text-muted"
                >
                  최종가
                  <b className="font-mono tabular-nums text-small text-accent-2">{won(finalUnit)}</b>
                </span>
                <button
                  type="button"
                  aria-label="장비 행 삭제"
                  onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  disabled={disabled}
                  className="px-2 text-muted hover:text-danger"
                >
                  ×
                </button>
                <input
                  aria-label="장비 비고"
                  value={r.remark ?? ""}
                  onChange={(e) => updateItem(i, { remark: e.target.value })}
                  disabled={disabled}
                  placeholder="비고 (선택)"
                  className="basis-full rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
                />
              </div>
              {/* 포함옵션 2열 */}
              <IncludedEditor
                included={r.included}
                setIncluded={(x) => updateItem(i, { included: x })}
                disabled={disabled}
              />
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

    {/* 추가 옵션 — 별도 과금(자유 입력). 포함옵션과 별개로 견적서에 단가×수량 표시. */}
    <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">추가 옵션</h2>
      <div className="flex flex-col gap-2">
        {options.map((r, i) => {
          const lineTotal = (Number.isFinite(r.unitPrice) ? r.unitPrice : 0) * (Number.isFinite(r.quantity) ? r.quantity : 0);
          const update = (patch: Partial<QuoteRow>) => setOptions(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label="추가 옵션 이름" value={r.name} onChange={(e) => update({ name: e.target.value })} disabled={disabled} placeholder="옵션명"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text" />
              <input aria-label="추가 옵션 단가" type="number" value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""} onChange={(e) => update({ unitPrice: numOrNaN(e.target.value) })} disabled={disabled} placeholder="단가"
                className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
              <input aria-label="추가 옵션 수량" type="number" value={Number.isFinite(r.quantity) ? r.quantity : ""} onChange={(e) => update({ quantity: numOrNaN(e.target.value) })} disabled={disabled} placeholder="수량"
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
              <span className="w-32 shrink-0 text-right font-mono tabular-nums text-small text-muted">{won(lineTotal)}</span>
              <button type="button" aria-label="추가 옵션 행 삭제" onClick={() => setOptions(options.filter((_, idx) => idx !== i))} disabled={disabled}
                className="px-2 text-muted hover:text-danger">×</button>
              <input aria-label="추가 옵션 비고" value={r.remark ?? ""} onChange={(e) => update({ remark: e.target.value })} disabled={disabled} placeholder="비고 (선택)"
                className="basis-full rounded-md border border-border bg-surface px-2 py-1 text-small text-text" />
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

// 한 장비의 포함옵션 편집(이름·가격) — 2열. 가격은 견적서엔 표기 안 되고 장비 최종가에 합산된다.
function IncludedEditor({
  included,
  setIncluded,
  disabled,
}: {
  included: IncludedRow[];
  setIncluded: (r: IncludedRow[]) => void;
  disabled: boolean;
}) {
  const numOr = (s: string) => (s.trim() === "" ? 0 : Number(s));
  function update(i: number, patch: Partial<IncludedRow>) {
    setIncluded(included.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-micro font-semibold text-muted">포함옵션 (가격은 견적서 미표기 · 장비 최종가에 합산)</span>
        <button
          type="button"
          onClick={() => setIncluded([...included, { name: "", price: 0 }])}
          disabled={disabled}
          className="text-micro font-semibold text-accent hover:underline"
        >
          + 옵션 추가
        </button>
      </div>
      {included.length === 0 ? (
        <p className="text-micro text-faint">포함옵션이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {included.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                aria-label="포함옵션 이름"
                value={o.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={disabled}
                placeholder="옵션명"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
              />
              <input
                aria-label="포함옵션 가격"
                type="number"
                min={0}
                value={Number.isFinite(o.price) ? o.price : ""}
                onChange={(e) => update(i, { price: numOr(e.target.value) })}
                disabled={disabled}
                placeholder="0"
                className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-small text-text"
              />
              <button
                type="button"
                aria-label="포함옵션 삭제"
                onClick={() => setIncluded(included.filter((_, idx) => idx !== i))}
                disabled={disabled}
                className="px-1 text-muted hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
