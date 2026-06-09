import Link from "next/link";
import type { QuoteListItem } from "@/lib/quotes/queries";

const won = (s: string) => `${Number(s).toLocaleString("ko-KR")}원`;
const dt = (iso: string) => `${iso.slice(0, 10)} · ${iso.slice(11, 16)}`;

// 버전 이력 표 — 행 클릭(=링크)으로 ?v=<id> 전환. 현재 표시 버전 강조.
export function VersionHistory({
  applicationId, quotes, currentQuoteId,
}: {
  applicationId: string;
  quotes: QuoteListItem[];
  currentQuoteId: string;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">버전 이력 ({quotes.length}개 버전)</h2>
        <span className="text-micro text-muted">행을 클릭하면 해당 버전을 표시합니다</span>
      </div>
      <div className="overflow-hidden rounded-sm border border-border">
        <table className="w-full text-small">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">버전</th>
              <th className="px-3 py-2 text-left font-medium">견적번호</th>
              <th className="px-3 py-2 text-left font-medium">발급일시</th>
              <th className="px-3 py-2 text-right font-medium">합계금액</th>
              <th className="px-3 py-2 text-left font-medium">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quotes.map((q) => {
              const active = q.id === currentQuoteId;
              return (
                <tr key={q.id} className={active ? "bg-accent-soft" : "hover:bg-surface-2"}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/applications/${applicationId}?v=${q.id}`} className="font-medium text-accent">
                      v{q.version}{active ? " 현재" : ""}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-text">{q.quote_no}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-muted">{q.issued_at ? dt(q.issued_at) : dt(q.created_at)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text">{won(q.total)}</td>
                  <td className="px-3 py-2 text-muted">{q.status === "issued" ? "발행" : "임시"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
