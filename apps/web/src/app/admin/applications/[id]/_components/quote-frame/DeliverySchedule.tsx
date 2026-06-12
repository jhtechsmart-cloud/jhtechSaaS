"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setQuoteDeliveryAction } from "@/lib/quotes/actions";

// 납품 일정 입력 — 발행(issued) 견적에서만 활성. 임시(draft)는 비활성+안내.
// 저장값은 대시보드 2주 캘린더·데모예약 월캘린더의 '납품' 이벤트로 노출된다.
export function DeliverySchedule({
  quoteId,
  issued,
  initialDate,
  initialTime,
  canWrite,
}: {
  quoteId: string;
  issued: boolean;
  initialDate: string | null;
  initialTime: string | null; // "HH:mm:ss" | null
  canWrite: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate ?? "");
  const [time, setTime] = useState(initialTime?.slice(0, 5) ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !issued || !canWrite || pending;
  const dirty = date !== (initialDate ?? "") || time !== (initialTime?.slice(0, 5) ?? "");

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setQuoteDeliveryAction(quoteId, {
        date: date || null,
        time: time || null,
      });
      if (result?.error) setMessage(result.error);
      else {
        setMessage("저장됨");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3 text-small">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-micro text-muted">납품 일정</span>
        {!issued && <span className="text-micro text-faint">발행 후 입력 가능</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          aria-label="납품일"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-small tabular-nums text-text disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
        />
        <input
          type="time"
          aria-label="납품 시각"
          value={time}
          step={900}
          onChange={(e) => setTime(e.target.value)}
          disabled={disabled || !date}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-small tabular-nums text-text disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
        />
        {issued && canWrite && (
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-small font-medium text-white disabled:bg-surface-2 disabled:text-faint"
          >
            {pending ? "저장 중" : "저장"}
          </button>
        )}
      </div>
      {message && (
        <p className={`mt-1 text-micro ${message === "저장됨" ? "text-accent" : "text-coral-text"}`}>{message}</p>
      )}
    </div>
  );
}
