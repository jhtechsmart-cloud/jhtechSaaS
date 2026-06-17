"use client";

// 견적 작성 화면 하단 고정 바(lg 미만 전용). 데스크톱 우측 sticky 요약(QuoteTotalsAside)은 그대로.
// 합계·핸들러·pending은 상위 폼('use client')에서 prop으로 받아 재사용 → 중복 로직 없음.
export function QuoteBottomBar({
  supplyPrice,
  pending,
  onSave,
  onIssue,
}: {
  supplyPrice: number;
  pending: boolean;
  onSave: () => void;
  onIssue: () => void;
}) {
  return (
    <div
      data-testid="quote-bottom-bar"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,.08)] lg:hidden"
    >
      <span className="min-w-0 truncate text-body font-semibold text-text">
        공급가 <span className="tabular-nums">{supplyPrice.toLocaleString("ko-KR")}</span>원
        <span className="ml-1 text-micro font-normal text-muted">VAT 별도</span>
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-surface-2 px-3 py-2 text-small font-semibold text-text disabled:opacity-50"
        >
          임시저장
        </button>
        <button
          type="button"
          onClick={onIssue}
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-small font-semibold text-white disabled:opacity-50"
        >
          발행하기
        </button>
      </div>
    </div>
  );
}
