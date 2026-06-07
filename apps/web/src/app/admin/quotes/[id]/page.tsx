import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { getQuote } from "@/lib/quotes/queries";
import { parseQuoteLines, type QuoteRow } from "@/lib/quotes/form";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "임시", cls: "bg-surface-2 text-muted" },
  issued: { label: "발행", cls: "bg-green-100 text-green-700" },
};
const won = (s: string) => `${Number(s).toLocaleString("ko-KR")}원`;

// 견적 상세 — 읽기전용 내역 + 재발행. 가드: 견적 콘솔(application detail와 동일 audience).
export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireApplicationsConsole();
  if (access.status === "forbidden") {
    return <p className="text-body text-muted">견적 조회 권한이 없습니다.</p>;
  }
  const q = await getQuote(id);
  if (!q) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">견적을 찾을 수 없습니다.</p>
        <Link href="/admin/applications" className="text-small text-accent">← 견적 목록</Link>
      </div>
    );
  }
  const s = STATUS[q.status] ?? STATUS.draft;
  const items = parseQuoteLines(q.items);
  const options = parseQuoteLines(q.options);
  const canReissue = can(access.permissions, "quotes.write");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href={`/admin/applications/${q.application_id}`} className="text-small text-muted hover:text-text">
          ← 의뢰로
        </Link>
        <span className={`rounded-sm px-2 py-0.5 text-small font-medium ${s.cls}`}>{s.label}</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-small text-muted">견적번호</div>
          <div className="font-mono tabular-nums text-h1 text-text">{q.quote_no}</div>
        </div>
        {canReissue && (
          <Link
            href={`/admin/applications/${q.application_id}/quote/new?from=${q.id}`}
            className="rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white"
          >
            재발행
          </Link>
        )}
      </div>

      <LineTable title="장비" rows={items} />
      {options.length > 0 && <LineTable title="옵션" rows={options} />}

      <section className="rounded-md border border-border bg-surface p-4">
        <TotalRow label="공급가" value={q.supply_price} />
        <TotalRow label="세액 (10%)" value={q.tax_price} />
        <div className="my-2 border-t border-border" />
        <TotalRow label="합계" value={q.total} strong />
      </section>
    </div>
  );
}

function LineTable({ title, rows }: { title: string; rows: QuoteRow[] }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-small text-muted">없음</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-1.5 text-body">
              <span className="min-w-0 flex-1 truncate text-text">{r.name}</span>
              <span className="font-mono tabular-nums text-small text-muted">
                {r.unitPrice.toLocaleString("ko-KR")} × {r.quantity}
              </span>
              <span className="w-32 shrink-0 text-right font-mono tabular-nums text-small text-text">
                {(r.unitPrice * r.quantity).toLocaleString("ko-KR")}원
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-body ${strong ? "font-semibold text-text" : "text-muted"}`}>{label}</span>
      <span className={`font-mono tabular-nums ${strong ? "text-h2 font-semibold text-text" : "text-body text-text"}`}>
        {won(value)}
      </span>
    </div>
  );
}
