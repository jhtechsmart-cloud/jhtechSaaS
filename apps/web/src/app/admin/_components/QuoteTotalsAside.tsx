"use client";
import type { ReactNode } from "react";
import type { QuoteResult } from "@jhtechsaas/shared";

// 견적 작성 오른쪽 sticky 합계 패널 — 합계(공급가, VAT 별도) + 버튼 슬롯(children).
// 부가세는 화면에 따로 표시하지 않음(견적서 특기사항 'VAT 별도' 안내로 갈음).
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 좁은 화면(lg 미만)에선 sticky 해제.
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function QuoteTotalsAside({
  totals,
  children,
  below,
}: {
  totals: QuoteResult;
  children?: ReactNode;
  below?: ReactNode; // 합계 박스 아래 슬롯(영업일지 등) — 모바일에서도 노출
}) {
  return (
    // 합계 카드는 데스크톱 전용(모바일은 하단 고정 바), 아래 슬롯은 전 화면 노출.
    <div className="flex flex-col gap-4 self-start lg:sticky lg:top-0">
      <div className="hidden rounded-lg border border-border/60 bg-surface p-5 shadow-sm lg:block">
        <h2 className="mb-3 text-h2 font-medium text-text">실시간 합계</h2>
        <TotalRow label="합계 (VAT 별도)" value={totals.supplyPrice} strong />
        {children && (
          <div className="mt-4 flex flex-col gap-2">{children}</div>
        )}
      </div>
      {below}
    </div>
  );
}

// 한 줄 레이블+금액 행. strong=true 이면 강조(합계).
function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={`text-body ${strong ? "font-semibold text-text" : "text-muted"}`}
      >
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${
          strong
            ? "text-h2 font-semibold text-text"
            : "text-body text-text"
        }`}
      >
        {won(value)}
      </span>
    </div>
  );
}
