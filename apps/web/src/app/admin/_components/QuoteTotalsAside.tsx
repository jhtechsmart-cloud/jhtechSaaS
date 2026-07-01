"use client";
import type { ReactNode } from "react";
import { QuoteBreakdown, type QuoteLineRow } from "./QuoteBreakdown";

// 견적 작성/수정·수기 오른쪽 sticky 합계 패널 — 견적 상세(QuoteSummaryPanel)와 동일한
// 소계 분해(장비 소계·옵션 소계·합계 금액)를 실시간으로 표시 + 버튼 슬롯(children).
// 부가세는 화면에 따로 표시하지 않음(견적서 특기사항 'VAT 별도' 안내로 갈음).
// QuoteForm(의뢰)·ManualQuoteForm(수기) 공유. 좁은 화면(lg 미만)에선 sticky 해제(하단 고정 바 사용).
export function QuoteTotalsAside({
  equipmentSubtotal,
  optionSubtotal,
  itemLines,
  optionLines,
  total,
  children,
  below,
}: {
  equipmentSubtotal: number;
  optionSubtotal: number;
  itemLines: QuoteLineRow[];
  optionLines: QuoteLineRow[];
  total: number; // 공급가(VAT 별도)
  children?: ReactNode;
  below?: ReactNode; // 합계 박스 아래 슬롯(영업일지 등) — 모바일에서도 노출
}) {
  return (
    // 합계 카드는 데스크톱 전용(모바일은 하단 고정 바), 아래 슬롯은 전 화면 노출.
    <div className="flex flex-col gap-4 self-start lg:sticky lg:top-0">
      <div className="hidden rounded-lg border border-border/60 bg-surface p-5 shadow-sm lg:block">
        <h2 className="mb-3 text-h2 font-medium text-text">실시간 합계</h2>
        <QuoteBreakdown
          equipmentSubtotal={equipmentSubtotal}
          optionSubtotal={optionSubtotal}
          items={itemLines}
          options={optionLines}
          total={total}
          totalLabel="합계 금액"
          totalNote="VAT 별도"
        />
        {children && <div className="mt-2 flex flex-col gap-2">{children}</div>}
      </div>
      {below}
    </div>
  );
}
