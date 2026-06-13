import Link from "next/link";
import type { CalendarEvent, TwoWeekDay } from "@/lib/dashboard/v2-logic";
import { groupEventsByDay } from "@/lib/dashboard/v2-logic";
import { EVENT_META } from "@/lib/dashboard/v2-meta";

// 2주 캘린더(전체 폭) — 일반 달력처럼 연속 셀 그리드(hairline 구분)로 2주를 표시.
// 헤더에 연·월 표기(두 달에 걸치면 "6월–7월"), 요일 헤더 행 + 날짜 2행.
// 이벤트 칩 5색, 지난 요일 opacity .55, 오늘 민트 하이라이트, 매월 1일은 "M/1"로 월 전환 표시.

const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 14일 범위의 연·월 라벨 — "2026년 6월" 또는 "2026년 6월–7월"(연도 걸치면 둘 다 표기). */
function monthLabel(days: TwoWeekDay[]): string {
  const first = days[0].date;
  const last = days[13].date;
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  if (fy === ly && fm === lm) return `${fy}년 ${fm}월`;
  if (fy === ly) return `${fy}년 ${fm}월–${lm}월`;
  return `${fy}년 ${fm}월–${ly}년 ${lm}월`;
}

function DayCell({
  day,
  events,
}: {
  day: TwoWeekDay;
  events: CalendarEvent[];
}) {
  const [, mm, dd] = day.date.split("-").map(Number);
  // 매월 1일은 월 전환이 보이게 "M/1", 그 외는 일자만
  const dayLabel = dd === 1 ? `${mm}/1` : String(dd);
  return (
    <div
      className={`min-h-[115px] p-1.5 ${day.isToday ? "bg-mint" : "bg-surface"} ${
        day.isPast ? "opacity-55" : ""
      }`}
    >
      <p
        className={`mb-1 text-micro tabular-nums ${
          day.isToday
            ? "font-bold text-accent"
            : dd === 1
              ? "font-semibold text-text"
              : "text-muted"
        }`}
      >
        {dayLabel}
        {day.isToday && <span className="ml-1 font-semibold">오늘</span>}
      </p>
      <div className="flex flex-col gap-1">
        {events.map((e) => {
          const meta = EVENT_META[e.type];
          return (
            <Link
              key={e.id}
              href={e.href}
              title={e.title}
              className="block truncate rounded px-1.5 py-0.5 text-micro font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: meta.bg,
                color: meta.fg,
                boxShadow: `inset 2px 0 0 ${meta.color}`,
              }}
            >
              {e.hm ? <span className="tabular-nums">{e.hm} </span> : null}
              {e.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function TwoWeekCalendar({
  days,
  events,
}: {
  days: TwoWeekDay[];
  events: CalendarEvent[];
}) {
  const byDay = groupEventsByDay(events);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <p className="text-h2 font-semibold text-text">2주 일정</p>
          <p className="text-body font-medium text-muted tabular-nums">{monthLabel(days)}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-micro text-muted">
          {(Object.keys(EVENT_META) as Array<keyof typeof EVENT_META>).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_META[k].color }} />
              {EVENT_META[k].label}
            </span>
          ))}
        </div>
      </div>

      {/* 일반 달력 그리드 — gap-px + 배경색이 hairline 셀 구분선 역할 */}
      <div className="overflow-hidden rounded-xl border border-row-line">
        <div className="grid grid-cols-7 gap-px bg-row-line">
          {DOW_LABELS.map((w, i) => (
            <div
              key={w}
              className={`bg-surface-2 py-1.5 text-center text-micro font-medium ${
                i === 0 || i === 6 ? "text-muted-foreground" : "text-muted"
              }`}
            >
              {w}
            </div>
          ))}
          {days.map((d) => (
            <DayCell key={d.date} day={d} events={byDay.get(d.date) ?? []} />
          ))}
        </div>
      </div>
    </section>
  );
}
