import { SectionHeader } from "./SectionHeader";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
type ExtraRow = { name: string; unitPrice: number; quantity: number };

// 포함 옵션(발행본=견적 스냅샷·미발행=요청장비 카탈로그) + 추가 옵션(과금).
export function OptionLists({ included, extra }: { included: { name: string }[]; extra: ExtraRow[] }) {
  return (
    <>
      {included.length > 0 && (
        <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
          <SectionHeader title="포함 옵션" meta={`${included.length}개 · 기본 공급가 포함`} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {included.map((o, i) => (
              <div key={i} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-small text-text">
                <span className="text-accent">✓</span> {o.name}
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
        <SectionHeader title="추가 옵션" meta="개별 견적 항목" />
        {extra.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border py-6 text-center text-small text-muted">선택된 추가 옵션이 없습니다.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {extra.map((o, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-body">
                <span className="min-w-0 flex-1 truncate text-text">{o.name}</span>
                <span className="font-mono tabular-nums text-small text-muted">{o.unitPrice.toLocaleString("ko-KR")} × {o.quantity}</span>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums text-small text-text">{won(o.unitPrice * o.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
