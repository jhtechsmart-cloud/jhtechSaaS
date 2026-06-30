"use client";
import type { ReactNode } from "react";
import {
  catalogIncluded,
  type IncludedRow,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { publicImageUrl } from "@/lib/equipment/images";
import { SectionHeader } from "./SectionHeader";

// 견적 라인 에디터 — 시안(상세보기) 형태의 카드 레이아웃.
// 선택 장비(카드: 이미지+사양표) + 포함옵션(체크박스·가격) + 추가옵션(개별 과금 표).
// 장비는 카탈로그에서 선택(직접입력 폴백), 복수 장비 지원(+ 장비 추가). 기본가·수량은 카드에서 직접 편집.
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 전체 합계는 우측 패널(QuoteTotalsAside).
const numOrNaN = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
const emptyItem = (): ItemRow => ({ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] });
const emptyExtra = (): QuoteRow => ({ name: "", unitPrice: 0, quantity: 1 });
const named = (rows: { name: string }[]) => rows.filter((o) => o.name.trim() !== "").length;

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

  // 섹션 헤더 메타(상단 우측) — 기본 공급가 합 · 포함옵션 총 개수.
  const baseSupply = items.reduce(
    (s, r) => s + (Number.isFinite(r.unitPrice) ? r.unitPrice : 0) * (Number.isFinite(r.quantity) ? r.quantity : 0),
    0,
  );
  const includedTotal = items.reduce((s, r) => s + named(r.included), 0);
  const extraCount = named(options); // 추가옵션 개수(견적 단위, 카드 사양행 표시용)

  return (
    <div className="flex flex-col gap-6">
      {/* ① 선택 장비 — 카드(이미지+사양) 목록 */}
      <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
        <SectionHeader title="선택 장비" meta={`기본 공급가 ₩${baseSupply.toLocaleString("ko-KR")} · 포함옵션 ${includedTotal}개`} />

        <ul className="flex flex-col divide-y divide-border">
          {items.map((r, i) => {
            const eq = r.equipmentId ? catalog.find((c) => c.id === r.equipmentId) : undefined;
            return (
              <li key={i} className="flex flex-col gap-4 py-5 first:pt-1 last:pb-1">
                {/* 장비 사진(가로 넓게) + 사양표 */}
                <div className="flex flex-col gap-5 sm:flex-row">
                  {eq?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicImageUrl(eq.image)} alt={r.name || "장비"} className="aspect-[4/3] w-full shrink-0 rounded-md border border-border bg-surface-2 object-contain p-2 sm:w-80" />
                  ) : (
                    <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center rounded-md bg-surface-2 text-small text-muted sm:w-80">
                      이미지 없음
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {eq?.category && (
                      <span className="inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-medium text-accent">{eq.category}</span>
                    )}
                    <div className="mt-2 text-display font-bold text-text">{r.name || "장비 미선택"}</div>
                    <dl className="mt-3 divide-y divide-border border-t border-border">
                      <SpecRow label="모델">{eq?.model ?? r.name ?? "-"}</SpecRow>
                      <SpecRow label="기본 공급가">
                        <input
                          aria-label="장비 가격"
                          type="number"
                          value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""}
                          onChange={(e) => updateItem(i, { unitPrice: numOrNaN(e.target.value) })}
                          disabled={disabled}
                          placeholder="0"
                          className="w-40 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
                        />
                        <span className="text-small font-normal text-muted">원 (VAT 별도)</span>
                      </SpecRow>
                      <SpecRow label="수량">
                        <input
                          aria-label="장비 수량"
                          type="number"
                          value={Number.isFinite(r.quantity) ? r.quantity : ""}
                          onChange={(e) => updateItem(i, { quantity: numOrNaN(e.target.value) })}
                          disabled={disabled}
                          placeholder="1"
                          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
                        />
                        <span className="text-small font-normal text-muted">대</span>
                      </SpecRow>
                      <SpecRow label="포함 / 추가 옵션">{named(r.included)}개 / {extraCount}개</SpecRow>
                    </dl>
                  </div>
                </div>

                {/* 장비 변경(드롭다운) + 직접입력 이름 + 삭제 */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="mr-auto text-small text-muted">다른 장비로 변경하려면 우측 드롭다운에서 선택하세요.</span>
                  {r.equipmentId === "" && (
                    <input
                      aria-label="장비 이름"
                      value={r.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      disabled={disabled}
                      placeholder="장비명 직접 입력"
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text sm:flex-none sm:basis-48"
                    />
                  )}
                  <select
                    aria-label="장비 선택"
                    value={r.equipmentId}
                    onChange={(e) => selectEquipment(i, e.target.value)}
                    disabled={disabled}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
                  >
                    <option value="">직접 입력</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.category ? ` · ${c.category}` : ""}</option>
                    ))}
                  </select>
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

                {/* 장비 비고 */}
                <input
                  aria-label="장비 비고"
                  value={r.remark ?? ""}
                  onChange={(e) => updateItem(i, { remark: e.target.value })}
                  disabled={disabled}
                  placeholder="비고 (선택)"
                  className="rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
                />

                {/* 포함 옵션(체크박스 + 가격) */}
                <IncludedOptions
                  item={r}
                  catalog={catalog}
                  setIncluded={(x) => updateItem(i, { included: x })}
                  disabled={disabled}
                />
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => setItems([...items, emptyItem()])}
          disabled={disabled}
          className="mt-2 self-start text-small font-medium text-accent hover:underline"
        >
          + 장비 추가
        </button>
      </section>

      {/* ② 추가 옵션 — 별도 과금(자유 입력). 포함옵션과 별개로 견적서에 단가×수량 표시. */}
      <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
        <SectionHeader title="추가 옵션" meta="개별 견적 항목" />
        {options.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border py-6 text-center text-small text-muted">선택된 추가 옵션이 없습니다.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-micro font-semibold text-muted">
                <th className="pb-2 text-left">옵션명</th>
                <th className="pb-2 text-right">단가 (원)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {options.map((r, i) => {
                const update = (patch: Partial<QuoteRow>) => setOptions(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
                return (
                  <tr key={i} className="border-b border-row-line align-top">
                    <td className="py-2 pr-3">
                      <input aria-label="추가 옵션 이름" value={r.name} onChange={(e) => update({ name: e.target.value })} disabled={disabled} placeholder="옵션명"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-body text-text" />
                      <input aria-label="추가 옵션 비고" value={r.remark ?? ""} onChange={(e) => update({ remark: e.target.value })} disabled={disabled} placeholder="비고 (선택)"
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-small text-text" />
                    </td>
                    <td className="w-44 py-2">
                      <input aria-label="추가 옵션 단가" type="number" value={Number.isFinite(r.unitPrice) ? r.unitPrice : ""} onChange={(e) => update({ unitPrice: numOrNaN(e.target.value) })} disabled={disabled} placeholder="0"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
                      <input aria-label="추가 옵션 수량" type="number" value={Number.isFinite(r.quantity) ? r.quantity : ""} onChange={(e) => update({ quantity: numOrNaN(e.target.value) })} disabled={disabled} placeholder="수량"
                        className="mt-1.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-small text-text" />
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" aria-label="추가 옵션 행 삭제" onClick={() => setOptions(options.filter((_, idx) => idx !== i))} disabled={disabled}
                        className="px-2 text-muted hover:text-danger">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <button type="button" onClick={() => setOptions([...options, emptyExtra()])} disabled={disabled}
          className="mt-3 rounded-md border border-dashed border-border px-4 py-2 text-small font-medium text-muted hover:text-text">+ 항목 직접 추가</button>
      </section>
    </div>
  );
}

// 사양표 한 줄 — 라벨(좌) + 값/입력(우).
function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-4 py-2.5">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-body font-semibold text-text">{children}</dd>
    </div>
  );
}

// 한 장비의 포함옵션 — 카탈로그 옵션을 체크박스로 토글(가격은 켜진 옵션 옆에서 편집).
// 카탈로그에 없는(구 견적·직접입력) 포함옵션은 별도 체크 항목으로 보존(끄면 제거).
// 포함옵션 가격은 견적서엔 미표기되고 장비 최종가에 합산된다.
function IncludedOptions({
  item,
  catalog,
  setIncluded,
  disabled,
}: {
  item: ItemRow;
  catalog: QuoteCatalogItem[];
  setIncluded: (r: IncludedRow[]) => void;
  disabled: boolean;
}) {
  const cat = item.equipmentId ? catalog.find((c) => c.id === item.equipmentId) : undefined;
  const catOpts = cat?.options ?? [];
  const catNames = new Set(catOpts.map((o) => o.name));
  // 표시 순서: 카탈로그 옵션 → 카탈로그에 없는 보존 옵션(이름 있는 것만).
  const display = [
    ...catOpts.map((o) => ({ name: o.name, defPrice: o.price })),
    ...item.included.filter((o) => !catNames.has(o.name) && o.name.trim() !== "").map((o) => ({ name: o.name, defPrice: o.price })),
  ];

  const isOn = (name: string) => item.included.some((o) => o.name === name);
  const priceOf = (name: string) => item.included.find((o) => o.name === name)?.price ?? 0;
  function toggle(name: string, defPrice: number) {
    setIncluded(
      isOn(name)
        ? item.included.filter((o) => o.name !== name)
        : [...item.included, { name, price: Number.isFinite(defPrice) ? defPrice : 0 }],
    );
  }
  function setPrice(name: string, price: number) {
    setIncluded(item.included.map((o) => (o.name === name ? { ...o, price } : o)));
  }

  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-micro font-semibold text-muted">포함 옵션 · {named(item.included)}개 선택</span>
        <span className="text-micro text-faint">가격은 견적서 미표기 · 장비 최종가에 합산</span>
      </div>
      {display.length === 0 ? (
        <p className="text-micro text-faint">{item.equipmentId ? "이 장비에 등록된 포함옵션이 없습니다." : "장비를 선택하면 포함옵션을 고를 수 있습니다."}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {display.map((o) => {
            const on = isOn(o.name);
            return (
              <label
                key={o.name}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-small ${on ? "border-border bg-surface text-text" : "border-border bg-surface text-faint"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(o.name, o.defPrice)}
                  disabled={disabled}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="min-w-0 flex-1 truncate" title={o.name}>{o.name}</span>
                {on && (
                  <input
                    aria-label={`${o.name} 가격`}
                    type="number"
                    min={0}
                    value={Number.isFinite(priceOf(o.name)) ? priceOf(o.name) : ""}
                    onChange={(e) => setPrice(o.name, e.target.value.trim() === "" ? 0 : Number(e.target.value))}
                    disabled={disabled}
                    placeholder="0"
                    className="w-24 shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-small text-text"
                  />
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
