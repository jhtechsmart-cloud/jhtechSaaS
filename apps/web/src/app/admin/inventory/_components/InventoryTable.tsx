"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { InventoryRow } from "@/lib/inventory/queries";
import { stockStatus, STOCK_STATUS_LABEL } from "@/lib/inventory/status";
import { upsertInventoryAction } from "@/lib/inventory/actions";
import { InventoryDetailModal, type InventoryModalData } from "./InventoryDetailModal";

// 강조 배경 — 재고수량(민트)·판매확정(앰버)만 다른 항목과 구분.
const STOCK_BG = "#E7F5EF";
const SOLD_BG = "#FCF1DC";

// 행별 편집 상태(수량·데모·중고·입고예정일). 메모는 모달에서 편집. 판매확정은 읽기전용(취소 시만 감소).
interface RowState {
  stockQty: string;
  demoQty: string;
  usedQty: string;
  restockDate: string;
  note: string; // 유/무 표시 + 저장 시 보존
  soldConfirmed: number;
}

function initialState(rows: InventoryRow[]): Record<string, RowState> {
  const m: Record<string, RowState> = {};
  for (const r of rows) {
    m[r.equipmentId] = {
      stockQty: String(r.stockQty),
      demoQty: String(r.demoQty),
      usedQty: String(r.usedQty),
      restockDate: r.restockDate ?? "",
      note: r.note ?? "",
      soldConfirmed: r.soldConfirmed,
    };
  }
  return m;
}

function fmtUpdated(at: string | null, by: string | null): string {
  if (!at) return "—";
  const d = new Date(at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return by ? `${date} · ${by}` : date;
}

function parseQty(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function InventoryTable({ groups }: { groups: { category: string; rows: InventoryRow[] }[] }) {
  const allRows = groups.flatMap((g) => g.rows);
  const [state, setState] = useState<Record<string, RowState>>(() => initialState(allRows));
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [modalId, setModalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function set(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function save(row: InventoryRow) {
    const st = state[row.equipmentId];
    const qty = parseQty(st.stockQty);
    if (qty === null) {
      toast.error(`${row.name}: 재고 수량은 0 이상 정수여야 합니다.`);
      return;
    }
    const demo = parseQty(st.demoQty);
    const used = parseQty(st.usedQty);
    if (demo === null || used === null) {
      toast.error(`${row.name}: 데모·중고 수량은 0 이상 정수여야 합니다.`);
      return;
    }
    setSavingIds((s) => new Set(s).add(row.equipmentId));
    startTransition(async () => {
      const res = await upsertInventoryAction(row.equipmentId, {
        stockQty: qty,
        demoQty: demo,
        usedQty: used,
        restockDate: st.restockDate.trim() === "" ? null : st.restockDate.trim(),
        note: st.note.trim() === "" ? null : st.note.trim(),
      });
      setSavingIds((s) => {
        const n = new Set(s);
        n.delete(row.equipmentId);
        return n;
      });
      if (res?.error) toast.error(res.error);
      else toast.success(`${row.name} 재고 저장됨`);
    });
  }

  const modalRow = modalId ? allRows.find((r) => r.equipmentId === modalId) : null;
  const modalData: InventoryModalData | null =
    modalRow && state[modalId!]
      ? {
          equipmentId: modalRow.equipmentId,
          name: modalRow.name,
          model: modalRow.model,
          stockQty: parseQty(state[modalId!].stockQty) ?? 0,
          soldConfirmed: state[modalId!].soldConfirmed,
          restockDate: state[modalId!].restockDate.trim() === "" ? null : state[modalId!].restockDate.trim(),
          usedQty: parseQty(state[modalId!].usedQty) ?? 0,
          demoQty: parseQty(state[modalId!].demoQty) ?? 0,
          note: state[modalId!].note,
          updatedLabel: fmtUpdated(modalRow.updatedAt, modalRow.updatedByName),
        }
      : null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.category} className="rounded-md border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2 text-h2 font-medium text-text">{g.category}</h2>
          <div className="overflow-x-auto">
            <table className="table-fixed text-small">
              <colgroup>
                <col className="w-64" />{/* 장비 */}
                <col className="w-24" />{/* 상태 */}
                <col className="w-24" />{/* 재고 수량 */}
                <col className="w-24" />{/* 판매확정 */}
                <col className="w-36" />{/* 입고예정일 */}
                <col className="w-24" />{/* 중고장비 */}
                <col className="w-24" />{/* 데모장비 */}
                <col className="w-16" />{/* 메모 */}
                <col className="w-40" />{/* 최종수정 */}
                <col className="w-20" />{/* 저장 */}
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-2 font-medium">장비</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium" style={{ backgroundColor: STOCK_BG }}>재고 수량</th>
                  <th className="px-4 py-2 font-medium" style={{ backgroundColor: SOLD_BG }}>판매확정</th>
                  <th className="px-4 py-2 font-medium">입고예정일</th>
                  <th className="px-4 py-2 font-medium">중고장비</th>
                  <th className="px-4 py-2 font-medium">데모장비</th>
                  <th className="px-4 py-2 font-medium">메모</th>
                  <th className="px-4 py-2 font-medium">최종수정</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row) => {
                  const st = state[row.equipmentId];
                  const qtyNum = parseQty(st.stockQty) ?? 0;
                  const status = stockStatus(qtyNum);
                  const saving = savingIds.has(row.equipmentId);
                  const hasNote = st.note.trim() !== "";
                  return (
                    <tr
                      key={row.equipmentId}
                      onClick={() => setModalId(row.equipmentId)}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium text-text">{row.name}</div>
                        {row.model && <div className="font-mono text-muted">{row.model}</div>}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-small font-semibold"
                          style={
                            status === "in_stock"
                              ? { color: "#176455", backgroundColor: "#D9F3E9" }
                              : { color: "#C25434", backgroundColor: "#FDEEE8" }
                          }
                        >
                          {STOCK_STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="px-4 py-2" style={{ backgroundColor: STOCK_BG }} onClick={stop}>
                        <input
                          aria-label={`${row.name} 재고 수량`}
                          type="number"
                          min={0}
                          value={st.stockQty}
                          onChange={(e) => set(row.equipmentId, { stockQty: e.target.value })}
                          disabled={saving}
                          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-text"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-text" style={{ backgroundColor: SOLD_BG }}>
                        {st.soldConfirmed}
                      </td>
                      <td className="px-4 py-2" onClick={stop}>
                        <input
                          aria-label={`${row.name} 입고예정일`}
                          type="date"
                          value={st.restockDate}
                          onChange={(e) => set(row.equipmentId, { restockDate: e.target.value })}
                          disabled={saving}
                          className={`w-full rounded-md border bg-surface px-2 py-1 font-mono text-text ${status === "out_of_stock" ? "border-accent" : "border-border"}`}
                        />
                      </td>
                      <td className="px-4 py-2" onClick={stop}>
                        <input
                          aria-label={`${row.name} 중고장비`}
                          type="number"
                          min={0}
                          value={st.usedQty}
                          onChange={(e) => set(row.equipmentId, { usedQty: e.target.value })}
                          disabled={saving}
                          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-text"
                        />
                      </td>
                      <td className="px-4 py-2" onClick={stop}>
                        <input
                          aria-label={`${row.name} 데모장비`}
                          type="number"
                          min={0}
                          value={st.demoQty}
                          onChange={(e) => set(row.equipmentId, { demoQty: e.target.value })}
                          disabled={saving}
                          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-text"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-small font-medium ${hasNote ? "bg-mint text-accent" : "text-muted"}`}>
                          {hasNote ? "유" : "무"}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted">{fmtUpdated(row.updatedAt, row.updatedByName)}</td>
                      <td className="px-4 py-2" onClick={stop}>
                        <button
                          type="button"
                          onClick={() => save(row)}
                          disabled={saving}
                          className="rounded-md bg-accent px-3 py-1 text-small font-medium text-white disabled:opacity-50"
                        >
                          {saving ? "저장중…" : "저장"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {modalData && (
        <InventoryDetailModal
          data={modalData}
          onClose={() => setModalId(null)}
          onNoteSaved={(note) => set(modalData.equipmentId, { note })}
          onCanceled={() =>
            set(modalData.equipmentId, {
              soldConfirmed: Math.max(0, state[modalData.equipmentId].soldConfirmed - 1),
              stockQty: String((parseQty(state[modalData.equipmentId].stockQty) ?? 0) + 1),
            })
          }
        />
      )}
    </div>
  );
}
