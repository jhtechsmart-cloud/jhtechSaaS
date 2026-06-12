"use client";

import { useMemo } from "react";
import {
  SLOT_TIMES,
  computeSelection,
  occupiedSlotSet,
  type TimeSpan,
} from "@/lib/demo-reservations/slots";

// 15분 슬롯 그리드(09:00–17:45, 4열) — 재사용 가능한 시작시간 선택기.
// 점유 슬롯 = disabled+취소선, 선택 범위 = 민트 하이라이트, 충돌 = 부모에 통지(경고/저장막기).

export function TimeSlotPicker({
  existing,
  selectedStart,
  durationMin,
  onSelect,
}: {
  /** 해당 날짜의 기존 예약(취소 제외). */
  existing: TimeSpan[];
  selectedStart: string | null;
  durationMin: number;
  onSelect: (start: string) => void;
}) {
  const occupied = useMemo(() => occupiedSlotSet(existing), [existing]);
  const selection = useMemo(
    () =>
      selectedStart
        ? computeSelection(selectedStart, durationMin, existing)
        : null,
    [selectedStart, durationMin, existing],
  );
  const inRange = new Set(selection?.slots ?? []);

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {SLOT_TIMES.map((t) => {
        const isOccupied = occupied.has(t);
        const isStart = t === selectedStart;
        const isInRange = inRange.has(t);
        const rangeConflicted = isInRange && (selection?.conflict || selection?.exceedsClose);
        return (
          <button
            key={t}
            type="button"
            disabled={isOccupied}
            onClick={() => onSelect(t)}
            aria-pressed={isStart}
            className={`rounded-full border px-2 py-1.5 text-small tabular-nums transition-colors ${
              isOccupied
                ? "cursor-not-allowed border-row-line bg-surface-2 text-faint line-through"
                : isStart
                  ? rangeConflicted
                    ? "border-coral bg-coral-soft font-semibold text-coral-text"
                    : "border-accent bg-accent font-semibold text-white"
                  : isInRange
                    ? rangeConflicted
                      ? "border-coral-soft bg-coral-soft text-coral-text"
                      : "border-mint bg-mint text-accent"
                    : "border-border bg-surface text-text hover:bg-mint-hover"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
