"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/app/admin/_components/Icon";
import { todayKst } from "@/lib/format/kst";

// 월간 캘린더(좌 330px) — 데모 예약일=틸 dot, 납품일=파랑 dot. 날짜 클릭 → ?date= 동기화.
// 월 이동은 해당 월 1일로 선택 이동(상태는 URL 하나만 유지).

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 해당 월의 캘린더 칸(앞 공백 + 날짜들). 일요일 시작. */
function monthCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

export function DemoMonthCalendar({
  year,
  month,
  selected,
  demoDays,
  deliveryDays,
}: {
  year: number;
  month: number;
  selected: string;
  demoDays: string[];
  deliveryDays: string[];
}) {
  const router = useRouter();
  const demo = new Set(demoDays);
  const delivery = new Set(deliveryDays);
  const today = todayKst();

  const go = (date: string) => router.replace(`/admin/demo-reservations?date=${date}`);
  const prev = month === 1 ? `${year - 1}-12-01` : `${year}-${pad(month - 1)}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-h2 font-semibold text-text tabular-nums">
          {year}년 {month}월
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => go(prev)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => go(next)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-micro font-medium text-muted">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthCells(year, month).map((d, i) => {
          if (d == null) return <span key={`empty-${i}`} />;
          const date = `${year}-${pad(month)}-${pad(d)}`;
          const isSelected = date === selected;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => go(date)}
              aria-label={`${month}월 ${d}일`}
              aria-current={isSelected ? "date" : undefined}
              className={`relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-small tabular-nums transition-colors ${
                isSelected
                  ? "bg-accent font-semibold text-white"
                  : isToday
                    ? "bg-accent-soft font-semibold text-accent"
                    : "text-text hover:bg-surface-2"
              }`}
            >
              {d}
              <span className="absolute bottom-1 flex gap-0.5">
                {demo.has(date) && (
                  <span
                    className={`h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-accent-ring"}`}
                  />
                )}
                {delivery.has(date) && (
                  <span
                    className={`h-1 w-1 rounded-full ${isSelected ? "bg-white/70" : "bg-info"}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-4 border-t border-row-line pt-3 text-micro text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-ring" /> 데모 예약
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-info" /> 납품일
        </span>
      </div>
    </div>
  );
}
