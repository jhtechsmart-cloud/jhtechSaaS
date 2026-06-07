import type { QuoteListItem } from "@/lib/quotes/queries";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "임시", cls: "bg-surface-2 text-muted" },
  issued: { label: "발행", cls: "bg-green-100 text-green-700" },
};

const won = (s: string) => `${Number(s).toLocaleString("ko-KR")}원`;
const mmdd = (iso: string) => iso.slice(5, 10).replace("-", "-"); // YYYY-MM-DD → MM-DD

// 의뢰 상세의 견적 목록 — 최신 버전 먼저. 식별자·금액은 tabular-nums.
export function QuotesList({ quotes }: { quotes: QuoteListItem[] }) {
  if (quotes.length === 0) {
    return <p className="text-small text-muted">아직 작성된 견적이 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {quotes.map((q) => {
        const s = STATUS[q.status] ?? STATUS.draft;
        return (
          <li key={q.id} className="flex items-center gap-3 py-2">
            <span className="font-mono tabular-nums text-small text-text">{q.quote_no}</span>
            <span className={`rounded-sm px-2 py-0.5 text-micro font-medium ${s.cls}`}>{s.label}</span>
            <span className="ml-auto font-mono tabular-nums text-small text-text">{won(q.total)}</span>
            <span className="w-12 shrink-0 text-right font-mono tabular-nums text-micro text-muted">
              {mmdd(q.created_at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
