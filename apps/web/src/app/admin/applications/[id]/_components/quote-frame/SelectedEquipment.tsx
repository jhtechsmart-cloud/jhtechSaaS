import type { MatchableEquipmentWithOptions } from "@/lib/quotes/equipment-match.server";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
export type QuoteItemRow = { name: string; unitPrice: number; quantity: number };

// 선택 장비 — 매칭된 장비가 있으면 이미지·카테고리·기본공급가, 없으면 텍스트 라인.
export function SelectedEquipment({
  items, matched, quoteNo,
}: {
  items: QuoteItemRow[];
  matched: (MatchableEquipmentWithOptions | null)[]; // items와 동일 인덱스
  quoteNo: string;
}) {
  const supplyTotal = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">선택 장비</h2>
        <span className="text-micro text-muted">기본 공급가 {won(supplyTotal)}</span>
      </div>
      <ul className="flex flex-col gap-4">
        {items.map((it, i) => {
          const eq = matched[i];
          return (
            <li key={i} className="flex flex-col gap-3 sm:flex-row">
              {eq && eq.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eq.photos[0]} alt={it.name} className="h-32 w-44 shrink-0 rounded-sm object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                {eq?.category && <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-micro font-medium text-accent">{eq.category}</span>}
                <div className="mt-1 text-h2 font-semibold text-text">{it.name}</div>
                <div className="mt-2 flex flex-col gap-1 text-small">
                  <Row label="기본 공급가" value={`${won(it.unitPrice)} (VAT 별도)`} />
                  <Row label="수량" value={`${it.quantity}`} />
                  {eq && <Row label="포함 옵션" value={`${eq.options.filter((o) => o.kind === "included").length}개`} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex justify-end border-t border-border pt-2">
        <span className="font-mono tabular-nums text-small text-muted">견적번호 {quoteNo}</span>
      </div>
    </section>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3"><span className="w-20 shrink-0 text-muted">{label}</span>
      <span className="font-mono tabular-nums text-text">{value}</span></div>
  );
}
