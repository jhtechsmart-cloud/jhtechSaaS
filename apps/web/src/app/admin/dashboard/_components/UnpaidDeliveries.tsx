import Link from "next/link";
import type { UnpaidSummary } from "@/lib/dashboard/unpaid";
import { ApplicationStatusBadge } from "@/lib/application-status";
import { SectionHeader } from "@/app/admin/_components/SectionHeader";

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
const MAX_ROWS = 6;

// 미수금 — 납품완료·수금중(물건 나갔는데 수금 미완) 의뢰. 건수·총액 + 금액 큰 순 목록.
// 행 클릭 → 의뢰 상세. 금액은 대표 발행견적 공급가(VAT 별도).
export function UnpaidDeliveries({ summary }: { summary: UnpaidSummary }) {
  const shown = summary.items.slice(0, MAX_ROWS);
  const rest = summary.count - shown.length;
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <SectionHeader title="미수금 (계약 후 수금 미완)" />
      {summary.count === 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-small text-muted">
          미수금 건이 없습니다
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between rounded-lg bg-mint px-3 py-2">
            <span className="text-small font-medium text-accent-2">
              {summary.count}건 · 미수금 합계
            </span>
            <span className="font-mono text-h2 font-extrabold tabular-nums text-accent-2">
              {won(summary.totalAmount)}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {shown.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/admin/applications/${it.id}`}
                  className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-mint-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-small font-medium text-text">
                    {it.company}
                  </span>
                  <ApplicationStatusBadge status={it.status} testId={null} />
                  <span className="hidden w-20 shrink-0 text-right text-micro text-muted sm:inline">
                    {it.deliveryDate ?? "-"}
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-small font-semibold tabular-nums text-text">
                    {won(it.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <p className="mt-2 text-right text-micro text-muted">외 {rest}건</p>
          )}
        </>
      )}
    </section>
  );
}
