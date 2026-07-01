// 견적 소계 분해 블록 — 장비 소계(+라인) · 옵션 소계(+라인) · 합계 금액(민트 박스).
// 견적 상세(QuoteSummaryPanel)와 견적 작성/수정·수기(QuoteTotalsAside)가 공유해 동일하게 렌더.
const won = (s: string | number) => `₩${Number(s).toLocaleString("ko-KR")}`;
export type QuoteLineRow = { name: string; unitPrice: number; quantity: number };

export function QuoteBreakdown({
  equipmentSubtotal,
  optionSubtotal,
  items,
  options,
  total,
  totalLabel,
  totalNote,
}: {
  equipmentSubtotal: number;
  optionSubtotal: number;
  items: QuoteLineRow[];
  options: QuoteLineRow[];
  total: string | number;
  totalLabel: string;
  totalNote: string;
}) {
  return (
    <>
      <SubRow label="장비 소계" value={won(equipmentSubtotal)} />
      <LineList rows={items} />
      <SubRow label="옵션 소계" value={won(optionSubtotal)} />
      <LineList rows={options} emptyText="추가 옵션 없음" />
      <div className="my-3 rounded-md bg-mint px-3 py-2">
        <div className="text-micro text-muted">{totalLabel}</div>
        <div className="font-mono tabular-nums text-h1 font-extrabold text-accent-2">{won(total)}</div>
        <div className="text-micro text-muted">{totalNote}</div>
      </div>
    </>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-small">
      {/* 좌측 섹션 제목과 동일한 네이비 세로막대로 소계 제목 강조 */}
      <span className="flex items-center gap-1.5 font-medium text-text">
        <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-pine" />{label}
      </span>
      <span className="font-mono tabular-nums text-text">{value}</span>
    </div>
  );
}

// 소계 아래 서브 라인 — 이름 · 단가 × 개수. 빈 목록이면 옵션만 안내문(장비는 항상 있으니 미표시).
function LineList({ rows, emptyText }: { rows: QuoteLineRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return emptyText ? <div className="mb-1 pl-2 text-micro text-muted">{emptyText}</div> : null;
  }
  return (
    <div className="mb-1 flex flex-col gap-0.5 border-l border-border pl-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-2 text-micro">
          <span className="min-w-0 truncate text-muted">{r.name}</span>
          <span className="shrink-0 font-mono tabular-nums text-muted">{r.unitPrice.toLocaleString("ko-KR")} × {r.quantity}</span>
        </div>
      ))}
    </div>
  );
}
