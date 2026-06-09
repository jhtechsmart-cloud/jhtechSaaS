import type { QuoteValidity } from "@/lib/quotes/banner";

const won = (s: string) => `${Number(s).toLocaleString("ko-KR")}원`;

// 의뢰 상세 배너 — 대표 견적의 합계 + 유효기간(발행일+30일, 표시전용).
// 견적이 없으면 안내, 임시(draft)면 유효기간 대신 "발행 시 시작" 안내.
export function QuoteBanner({
  total,
  validity,
  isIssued,
}: {
  total: string | null;
  validity: QuoteValidity | null;
  isIssued: boolean;
}) {
  if (total == null) {
    return (
      <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-small text-muted">
        아직 작성된 견적이 없습니다.
      </div>
    );
  }

  // 유효기간 표기: D-N(남음)·D-0(당일)·N일 지남(만료). 만료는 danger 색.
  let validityNode: React.ReactNode;
  if (!isIssued) {
    validityNode = <span className="text-muted">임시 견적 · 발행 시 유효기간 시작</span>;
  } else if (validity) {
    const expired = validity.daysLeft < 0;
    validityNode = (
      <span className={expired ? "text-danger" : "text-text"}>
        유효기간{" "}
        <span className="font-mono tabular-nums">~{validity.validUntilLabel}</span>{" "}
        <span className={`font-mono tabular-nums font-medium ${expired ? "text-danger" : "text-accent"}`}>
          {expired ? `${Math.abs(validity.daysLeft)}일 지남` : `D-${validity.daysLeft}`}
        </span>
      </span>
    );
  } else {
    validityNode = null;
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-accent/30 bg-accent-soft px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-small text-muted">견적 합계</span>
        <span className="font-mono tabular-nums text-h2 font-semibold text-text">{won(total)}</span>
      </div>
      {validityNode && (
        <>
          <span className="text-muted">·</span>
          <span className="text-small">{validityNode}</span>
        </>
      )}
    </div>
  );
}
