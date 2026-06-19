import type { InventoryRow } from "@/lib/inventory/queries";
import { stockStatus, STOCK_STATUS_LABEL, type StockStatus } from "@/lib/inventory/status";

// 영업자용 읽기 전용 재고 뷰. PC = 평면 게시판 표(hidden lg:block), 모바일 = 카드 스택(lg:hidden).
// 편집 input·저장 없음(읽기 전용). 메모(note)는 노출하지 않음.

const STATUS_STYLE: Record<StockStatus, { color: string; bg: string }> = {
  in_stock: { color: "#176455", bg: "#D9F3E9" }, // 재고있음 — 파인 민트
  out_of_stock: { color: "#C25434", bg: "#FDEEE8" }, // 품절 — 코랄
};

function StatusBadge({ qty }: { qty: number }) {
  const s = stockStatus(qty);
  const st = STATUS_STYLE[s];
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-small font-semibold"
      style={{ color: st.color, backgroundColor: st.bg }}
    >
      {STOCK_STATUS_LABEL[s]}
    </span>
  );
}

function fmtUpdated(at: string | null, by: string | null): string {
  if (!at) return "—";
  const d = new Date(at);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return by ? `${date} · ${by}` : date;
}

export function InventoryView({ groups }: { groups: { category: string; rows: InventoryRow[] }[] }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.category} className="flex flex-col gap-2">
          <h2 className="text-h2 font-medium text-text">{g.category}</h2>

          {/* PC: 평면 게시판 표 */}
          <div className="hidden overflow-x-auto border-t border-border lg:block">
            {/* table-fixed + colgroup으로 열 너비 고정 — 분류 그룹마다 동일 정렬(통일성) */}
            <table className="w-full min-w-[720px] table-fixed text-small">
              <colgroup>
                <col />{/* 장비 — 나머지 폭 */}
                <col className="w-24" />{/* 상태 */}
                <col className="w-24" />{/* 재고 수량 */}
                <col className="w-32" />{/* 입고예정일 */}
                <col className="w-44" />{/* 최종수정 */}
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-4 font-medium">장비</th>
                  <th className="py-2 pr-4 font-medium">상태</th>
                  <th className="py-2 pr-4 font-medium">재고 수량</th>
                  <th className="py-2 pr-4 font-medium">입고예정일</th>
                  <th className="py-2 pr-4 font-medium">최종수정</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row) => (
                  <tr key={row.equipmentId} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-text">{row.name}</div>
                      {row.model && <div className="font-mono text-micro text-muted">{row.model}</div>}
                    </td>
                    <td className="py-2 pr-4"><StatusBadge qty={row.stockQty} /></td>
                    <td className="py-2 pr-4 font-mono tabular-nums text-text">{row.stockQty}</td>
                    <td className="py-2 pr-4 font-mono text-text">
                      {row.stockQty === 0 && row.restockDate ? row.restockDate : <span className="text-muted/60">—</span>}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted">{fmtUpdated(row.updatedAt, row.updatedByName)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 장비별 카드 스택 */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {g.rows.map((row) => (
              <li key={row.equipmentId} className="rounded-md border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-text">{row.name}</div>
                    {row.model && <div className="font-mono text-micro text-muted">{row.model}</div>}
                  </div>
                  <StatusBadge qty={row.stockQty} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-small">
                  <span className="text-muted">
                    수량 <span className="font-mono tabular-nums text-text">{row.stockQty}</span>
                  </span>
                  {row.stockQty === 0 && row.restockDate && (
                    <span className="text-muted">
                      입고예정 <span className="font-mono text-text">{row.restockDate}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
