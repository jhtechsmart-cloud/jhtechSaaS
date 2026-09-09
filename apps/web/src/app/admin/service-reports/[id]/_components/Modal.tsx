"use client";
import { useEffect, useRef } from "react";

// 상세 페이지 모달 셸(승인·완료·메일·무효화 공용) — role=dialog aria-modal, ESC 닫기, 열릴 때 첫 포커스,
// 닫힐 때 포커스 복귀(D-B16). 본문은 max-h-[90dvh] 스크롤(견적 메일 모달 패턴).
export function Modal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={busy ? undefined : onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-card sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-h2 font-semibold text-text">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="min-h-11 min-w-11 rounded-full text-muted hover:bg-surface-2 disabled:opacity-40">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
