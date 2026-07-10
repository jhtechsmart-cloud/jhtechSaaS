"use client";
import type { ReactNode } from "react";
import {
  type IncludedRow,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { publicImageUrl } from "@/lib/equipment/images";
import { SectionHeader } from "./SectionHeader";
import { AmountInput } from "./AmountInput";

// 견적 라인 에디터 — 시안(상세보기) 형태의 카드 레이아웃.
// 선택 장비(카드: 이미지+사양표) + 포함옵션(이름·수량·참고단가) + 추가옵션(개별 과금).
// 장비 등록옵션은 포함/추가 공용 풀 → 두 박스 모두 '등록 옵션 칩'으로 골라 담는다(자동 프리필 없음).
// 포함옵션 단가는 참고용(합계·PDF 미반영). 실제 금액은 장비 기본공급가에 직접 입력.
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 전체 합계는 우측 패널(QuoteTotalsAside).
const emptyItem = (): ItemRow => ({ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] });
const emptyExtra = (): QuoteRow => ({ name: "", unitPrice: 0, quantity: 1 });
const named = (rows: { name: string }[]) => rows.filter((o) => o.name.trim() !== "").length;

// 배열 두 원소 교환(경계 밖이면 원본 그대로) — 옵션 줄 순서 이동에 사용.
function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// 위/아래 이동 버튼(세로 스택) — 옵션 줄 순서 조정.
function MoveButtons({ onUp, onDown, canUp, canDown, disabled }: {
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean; disabled: boolean;
}) {
  return (
    <span className="flex shrink-0 flex-col leading-none">
      <button type="button" aria-label="위로 이동" onClick={onUp} disabled={disabled || !canUp}
        className="px-1 text-micro text-muted hover:text-text disabled:opacity-20">▲</button>
      <button type="button" aria-label="아래로 이동" onClick={onDown} disabled={disabled || !canDown}
        className="px-1 text-micro text-muted hover:text-text disabled:opacity-20">▼</button>
    </span>
  );
}

// 선택된 장비들의 등록 옵션 합집합(이름 기준 중복 제거) — 추가옵션 칩 출처.
function unionCatalogOptions(catalog: QuoteCatalogItem[], items: ItemRow[]): { name: string; price: number }[] {
  const seen = new Set<string>();
  const out: { name: string; price: number }[] = [];
  for (const it of items) {
    const eq = it.equipmentId ? catalog.find((c) => c.id === it.equipmentId) : undefined;
    for (const o of eq?.options ?? []) {
      if (o.name.trim() === "" || seen.has(o.name)) continue;
      seen.add(o.name);
      out.push({ name: o.name, price: Number.isFinite(o.price) ? o.price : 0 });
    }
  }
  return out;
}

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
  // 장비 선택 시 표시명·기본공급가만 채움(포함옵션은 자동 프리필 X — 칩으로 담음). "" = 직접 입력.
  function selectEquipment(i: number, equipmentId: string) {
    const eq = catalog.find((c) => c.id === equipmentId);
    updateItem(
      i,
      eq
        ? { equipmentId, name: eq.name, unitPrice: eq.basePrice, included: [] }
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
                        <AmountInput
                          aria-label="장비 가격"
                          value={r.unitPrice}
                          onChange={(v) => updateItem(i, { unitPrice: v })}
                          disabled={disabled}
                          placeholder="0"
                          className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
                        />
                        <span className="text-small font-normal text-muted">원 (VAT 별도)</span>
                      </SpecRow>
                      <SpecRow label="수량">
                        <AmountInput
                          aria-label="장비 수량"
                          value={r.quantity}
                          onChange={(v) => updateItem(i, { quantity: v })}
                          disabled={disabled}
                          placeholder="1"
                          className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
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
                      <option key={c.id} value={c.id}>{c.name}</option>
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
          <ul className="flex flex-col divide-y divide-border">
            {options.map((r, i) => {
              const update = (patch: Partial<QuoteRow>) => setOptions(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
              return (
                <li key={i} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
                  {/* 옵션명(넓게) · 수량 · 단가 · 삭제 — 한 줄 */}
                  <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
                    <label className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-micro font-semibold text-muted">옵션명</span>
                      <input aria-label="추가 옵션 이름" value={r.name} onChange={(e) => update({ name: e.target.value })} disabled={disabled} placeholder="옵션명"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-body text-text" />
                    </label>
                    <label className="flex w-24 flex-col gap-1">
                      <span className="text-micro font-semibold text-muted">수량</span>
                      <AmountInput aria-label="추가 옵션 수량" value={r.quantity} onChange={(v) => update({ quantity: v })} disabled={disabled} placeholder="수량"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
                    </label>
                    <label className="flex w-36 flex-col gap-1">
                      <span className="text-micro font-semibold text-muted">단가 (원)</span>
                      <AmountInput aria-label="추가 옵션 단가" value={r.unitPrice} onChange={(v) => update({ unitPrice: v })} disabled={disabled} placeholder="0"
                        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text" />
                    </label>
                    <span className="pb-1">
                      <MoveButtons
                        onUp={() => setOptions(swap(options, i, i - 1))}
                        onDown={() => setOptions(swap(options, i, i + 1))}
                        canUp={i > 0}
                        canDown={i < options.length - 1}
                        disabled={disabled}
                      />
                    </span>
                    <button type="button" aria-label="추가 옵션 행 삭제" onClick={() => setOptions(options.filter((_, idx) => idx !== i))} disabled={disabled}
                      className="px-1 pb-1.5 text-muted hover:text-danger">×</button>
                  </div>
                  {/* 비고 — 아래줄, 전체 폭 */}
                  <input aria-label="추가 옵션 비고" value={r.remark ?? ""} onChange={(e) => update({ remark: e.target.value })} disabled={disabled} placeholder="비고 (선택)"
                    className="w-full rounded-md border border-border bg-surface px-2 py-1 text-small text-text" />
                </li>
              );
            })}
          </ul>
        )}
        {/* 등록 옵션 칩(선택 장비들 옵션 합집합) + 직접 추가 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {(() => {
            const chips = unionCatalogOptions(catalog, items);
            return chips.length > 0 ? (
              <>
                <span className="text-micro text-faint">등록 옵션 추가:</span>
                {chips.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => setOptions([...options, { name: o.name, unitPrice: o.price, quantity: 1 }])}
                    disabled={disabled}
                    className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-micro text-muted hover:border-accent hover:text-text"
                  >
                    + {o.name}
                  </button>
                ))}
              </>
            ) : null;
          })()}
          <button type="button" onClick={() => setOptions([...options, emptyExtra()])} disabled={disabled}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-micro font-medium text-accent hover:underline">+ 항목 직접 추가</button>
        </div>
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

// 한 장비의 포함옵션 — 이름·수량·참고단가를 이 견적에서만 자유 편집(추가옵션과 동일 3칸).
// 각 줄 = [이름][수량][단가(참고)][삭제]. 등록 옵션은 하단 칩으로 빠르게 추가.
// ⚠️ 여기 값을 바꿔도 장비(카탈로그) 원본 옵션은 안 바뀐다(견적 jsonb kind=included에만 저장).
// 단가는 참고용 — 합계·견적서 PDF에 미반영(가격은 장비 기본공급가에 직접 반영). 수량은 PDF '헤드' 표시용.
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
  // 아직 견적에 없는(이름 매칭) 등록 옵션 — 빠른 추가 칩.
  const presentNames = new Set(item.included.map((o) => o.name));
  const addable = catOpts.filter((o) => !presentNames.has(o.name));

  function update(idx: number, patch: Partial<IncludedRow>) {
    setIncluded(item.included.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function remove(idx: number) {
    setIncluded(item.included.filter((_, i) => i !== idx));
  }
  function add(name: string, price: number) {
    setIncluded([...item.included, { name, quantity: 1, price: Number.isFinite(price) ? price : 0 }]);
  }

  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-micro font-semibold text-muted">포함 옵션 · {named(item.included)}개</span>
        <span className="text-micro text-faint">단가는 참고용(합계·견적서 미표기) · 수량은 &lsquo;헤드&rsquo;만 견적서 표시</span>
      </div>

      {item.included.length === 0 ? (
        <p className="text-micro text-faint">{item.equipmentId ? "포함옵션이 없습니다. 아래 등록 옵션 칩 또는 직접 추가로 담으세요." : "장비를 선택하면 포함옵션을 편집할 수 있습니다."}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* 열 타이틀 — 첫 줄에만(옵션 줄들은 입력칸만 이어짐) */}
          <div className="flex items-center gap-2 px-0.5 text-micro font-semibold text-faint">
            <span className="min-w-0 flex-1">옵션명</span>
            <span className="w-16 text-right">수량</span>
            <span className="w-24 text-right">단가(참고)</span>
            <span className="w-5 shrink-0" aria-hidden />
            <span className="w-5 shrink-0" aria-hidden />
          </div>
          {item.included.map((o, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                aria-label="포함 옵션 이름"
                value={o.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                disabled={disabled}
                placeholder="옵션명"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
              />
              <AmountInput
                aria-label="포함 옵션 수량"
                value={o.quantity}
                onChange={(v) => update(idx, { quantity: v })}
                disabled={disabled}
                placeholder="1"
                className="w-16 shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-small text-text"
              />
              <AmountInput
                aria-label="포함 옵션 단가"
                value={o.price}
                onChange={(v) => update(idx, { price: v })}
                disabled={disabled}
                placeholder="0"
                className="w-24 shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-small text-text"
              />
              <MoveButtons
                onUp={() => setIncluded(swap(item.included, idx, idx - 1))}
                onDown={() => setIncluded(swap(item.included, idx, idx + 1))}
                canUp={idx > 0}
                canDown={idx < item.included.length - 1}
                disabled={disabled}
              />
              <button
                type="button"
                aria-label="포함 옵션 삭제"
                onClick={() => remove(idx)}
                disabled={disabled}
                className="w-5 shrink-0 text-center text-muted hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {(addable.length > 0 || item.equipmentId) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {addable.length > 0 && <span className="text-micro text-faint">등록 옵션 추가:</span>}
          {addable.map((o) => (
            <button
              key={o.name}
              type="button"
              onClick={() => add(o.name, o.price)}
              disabled={disabled}
              className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-micro text-muted hover:border-accent hover:text-text"
            >
              + {o.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => add("", 0)}
            disabled={disabled}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-micro font-medium text-accent hover:underline"
          >
            + 직접 추가
          </button>
        </div>
      )}
    </div>
  );
}
