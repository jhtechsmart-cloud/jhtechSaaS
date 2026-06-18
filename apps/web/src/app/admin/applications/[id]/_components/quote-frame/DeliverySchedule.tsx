"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setQuoteDeliveryAction } from "@/lib/quotes/actions";
import { formatDateMask, parseDeliveryDate } from "@/lib/quotes/delivery-date";

// 납품 일정 입력 — 발행(issued) 견적에서만 활성. 임시(draft)는 비활성+안내.
// 저장값은 대시보드 2주 캘린더·데모예약 월캘린더의 '납품' 이벤트로 노출된다.
// 날짜는 한 칸 마스크 입력(숫자 연속 입력 → YYYY-MM-DD 자동 포맷) — 브라우저 기본
// date 입력이 연도→월 자동 이동을 안 하는 문제를 회피한다.
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
  const initialMasked = formatDateMask(initialDate ?? "");
  const [date, setDate] = useState(initialMasked); // 마스크 표시 문자열(YYYY-MM-DD)
  const [time, setTime] = useState(initialTime?.slice(0, 5) ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !issued || !canWrite || pending;
  const { iso: dateIso, error: dateError } = parseDeliveryDate(date);
  // 8자리를 다 친 뒤에도 잘못된 날짜(13월·2/30 등)일 때만 에러 노출 — 타이핑 중 잔소리 방지.
  const rawLen = date.replace(/\D/g, "").length;
  const showDateError = !!dateError && rawLen >= 8;
  const dirty = date !== initialMasked || time !== (initialTime?.slice(0, 5) ?? "");
  // 날짜가 미완성/유효하지 않으면 저장 막음(빈 값은 허용 = 날짜 제거).
  const canSave = !dateError && dirty;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setQuoteDeliveryAction(quoteId, {
        date: dateIso,
        time: dateIso ? time || null : null, // 날짜 없으면 시간도 제거
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
      {/* 좁은 요약 패널 → 날짜는 한 줄 전체, 시각+저장은 다음 줄(시간 칸 잘림 방지). */}
      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          aria-label="납품일"
          placeholder="YYYY-MM-DD"
          value={date}
          maxLength={10}
          onChange={(e) => setDate(formatDateMask(e.target.value))}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-small tabular-nums text-text disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            aria-label="납품 시각"
            value={time}
            step={900}
            onChange={(e) => setTime(e.target.value)}
            disabled={disabled || dateIso === null}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-small tabular-nums text-text disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
          />
          {issued && canWrite && (
            <button
              type="button"
              onClick={save}
              disabled={pending || !canSave}
              className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-small font-medium text-white disabled:bg-surface-2 disabled:text-faint"
            >
              {pending ? "저장 중" : "저장"}
            </button>
          )}
        </div>
      </div>
      {showDateError && <p className="mt-1 text-micro text-coral-text">{dateError}</p>}
      {message && (
        <p className={`mt-1 text-micro ${message === "저장됨" ? "text-accent" : "text-coral-text"}`}>{message}</p>
      )}
    </div>
  );
}
