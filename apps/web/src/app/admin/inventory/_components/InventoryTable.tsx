"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { InventoryRow } from "@/lib/inventory/queries";
import { stockStatus, STOCK_STATUS_LABEL } from "@/lib/inventory/status";
import { upsertInventoryAction } from "@/lib/inventory/actions";

// 행별 편집 상태(수량·입고예정일·메모). 저장 시 행 단위 upsert.
interface RowState {
  stockQty: string; // input 문자열(빈값 허용 → 저장 시 숫자 변환)
  restockDate: string;
  note: string;
}

function initialState(rows: InventoryRow[]): Record<string, RowState> {
  const m: Record<string, RowState> = {};
  for (const r of rows) {
    m[r.equipmentId] = {
      stockQty: String(r.stockQty),
      restockDate: r.restockDate ?? "",
      note: r.note ?? "",
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

export function InventoryTable({ groups }: { groups: { category: string; rows: InventoryRow[] }[] }) {
  const allRows = groups.flatMap((g) => g.rows);
  const [state, setState] = useState<Record<string, RowState>>(() => initialState(allRows));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function set(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  function save(row: InventoryRow) {
    const st = state[row.equipmentId];
    const qty = Number(st.stockQty);
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error("재고 수량은 0 이상 정수여야 합니다.");
      return;
    }
    setSavingId(row.equipmentId);
    startTransition(async () => {
      const res = await upsertInventoryAction(row.equipmentId, {
        stockQty: qty,
        restockDate: st.restockDate.trim() === "" ? null : st.restockDate.trim(),
        note: st.note.trim() === "" ? null : st.note.trim(),
      });
      setSavingId(null);
      if (res?.error) toast.error(res.error);
      else toast.success(`${row.name} 재고 저장됨`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.category} className="rounded-md border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-2 text-h2 font-medium text-text">{g.category}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-small">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-2 font-medium">장비</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium">재고 수량</th>
                  <th className="px-4 py-2 font-medium">입고예정일</th>
                  <th className="px-4 py-2 font-medium">메모</th>
                  <th className="px-4 py-2 font-medium">최종수정</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row) => {
                  const st = state[row.equipmentId];
                  const qtyNum = Number(st.stockQty) || 0;
                  const status = stockStatus(qtyNum);
                  const saving = savingId === row.equipmentId;
                  return (
                    <tr key={row.equipmentId} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2">
                        <div className="font-medium text-text">{row.name}</div>
                        {row.model && <div className="font-mono text-muted">{row.model}</div>}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-small font-semibold"
                          style={
                            status === "in_stock"
                              ? { color: "#176455", backgroundColor: "#D9F3E9" }
                              : { color: "#C25434", backgroundColor: "#FDEEE8" }
                          }
                        >
                          {STOCK_STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          aria-label={`${row.name} 재고 수량`}
                          type="number"
                          min={0}
                          value={st.stockQty}
                          onChange={(e) => set(row.equipmentId, { stockQty: e.target.value })}
                          disabled={saving}
                          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-text"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          aria-label={`${row.name} 입고예정일`}
                          type="date"
                          value={st.restockDate}
                          onChange={(e) => set(row.equipmentId, { restockDate: e.target.value })}
                          disabled={saving}
                          className={`rounded-md border bg-surface px-2 py-1 font-mono text-text ${status === "out_of_stock" ? "border-accent" : "border-border"}`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          aria-label={`${row.name} 메모`}
                          value={st.note}
                          onChange={(e) => set(row.equipmentId, { note: e.target.value })}
                          disabled={saving}
                          maxLength={500}
                          className="w-full min-w-[140px] rounded-md border border-border bg-surface px-2 py-1 text-text"
                        />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted">{fmtUpdated(row.updatedAt, row.updatedByName)}</td>
                      <td className="px-4 py-2">
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
    </div>
  );
}
