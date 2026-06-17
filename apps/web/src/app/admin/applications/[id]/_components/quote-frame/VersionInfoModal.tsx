"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { VersionChip } from "@/lib/quotes/version-chip";

// 처리바 좌측: 최신/선택 버전 요약 칩 + '버전정보' 버튼.
// 버튼을 누르면 버전 이력·변경 내역(children)을 모달로 띄운다.
// 칩은 항목별 nowrap + flex-wrap이라 좁아져도 글자가 짤리지 않고 자동으로 줄을 맞춘다.
// dangerZone — 모달 하단에 구분해서 두는 위험 동작(견적 삭제). 요약 패널 대신 여기로 모았다.
export function VersionInfoModal({
  chip,
  children,
  dangerZone,
}: {
  chip: VersionChip;
  children: ReactNode;
  dangerZone?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // ESC로 닫기. 열렸을 때만 리스너 등록.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-small">
        {/* 줄 제목 — 파인 막대 + 라벨(다른 박스의 SectionHeader와 같은 결). */}
        <span className="mr-1 flex shrink-0 items-center gap-1.5 font-semibold text-text">
          <span className="h-3.5 w-[3px] rounded-full bg-accent" aria-hidden />
          현재 버전
        </span>
        <span className="whitespace-nowrap font-mono font-bold tabular-nums text-accent">{chip.versionLabel}</span>
        <span className="text-faint">·</span>
        <span className="whitespace-nowrap font-mono tabular-nums text-text">{chip.quoteNo}</span>
        {chip.dateLabel && (
          <>
            <span className="text-faint">·</span>
            <span className="whitespace-nowrap font-mono tabular-nums text-muted">{chip.dateLabel}</span>
          </>
        )}
        <span className="text-faint">·</span>
        <span className="whitespace-nowrap font-mono font-semibold tabular-nums text-text">{chip.totalLabel}</span>
        <span
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-semibold ${
            chip.issued ? "bg-mint text-accent-2" : "bg-surface-2 text-muted"
          }`}
        >
          {chip.statusLabel}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-3 py-1 text-small font-medium text-accent hover:bg-surface-2"
        >
          버전정보
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/30 p-4 sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label="버전 정보"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[760px] rounded-2xl border border-border bg-surface shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-h2 font-semibold text-text">버전 정보</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="rounded-full p-1 text-muted hover:bg-surface-2"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-5 p-5">{children}</div>
            {/* 위험 구역 — 견적 삭제. 본문과 구분(상단 보더 + 라벨)해 실수 클릭 방지. */}
            {dangerZone && (
              <div className="border-t border-border px-5 py-4">
                <p className="mb-2 text-small font-semibold text-muted">견적 삭제</p>
                {dangerZone}
              </div>
            )}
            {/* 하단 닫기 버튼 — 상단 ✕ 외 명시적 닫기 동선. */}
            <div className="flex justify-end border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-5 py-1.5 text-small font-medium text-text hover:bg-surface-2"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
