import Link from "next/link";
import type { CalendarEvent, TwoWeekDay } from "@/lib/dashboard/v2-logic";
import { groupEventsByDay } from "@/lib/dashboard/v2-logic";
import { EVENT_META } from "@/lib/dashboard/v2-meta";

// 2주 캘린더(전체 폭) — "이번 주 / 다음 주" 라벨 구분선 2줄 × 7열.
// 이벤트 칩 = 좌측 보더 + 옅은 배경(5종 색), 지난 요일 opacity .55, 오늘 민트 하이라이트.

const DOW_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function WeekRow({
  label,
  days,
  byDay,
}: {
  label: string;
  days: TwoWeekDay[];
  byDay: Map<string, CalendarEvent[]>;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-micro font-bold uppercase tracking-[.08em] text-faint">{label}</span>
        <span className="h-px flex-1 bg-row-line" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const events = byDay.get(d.date) ?? [];
          const dayNum = Number(d.date.split("-")[2]);
          return (
            <div
              key={d.date}
              className={`min-h-20 rounded-lg border p-1.5 ${
                d.isToday ? "border-accent-ring bg-mint" : "border-row-line bg-surface"
              } ${d.isPast ? "opacity-55" : ""}`}
            >
              <p
                className={`mb-1 text-micro tabular-nums ${
                  d.isToday ? "font-bold text-accent" : "text-muted"
                }`}
              >
                {dayNum} {DOW_LABELS[d.dow]}
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
        <p className="text-h2 font-semibold text-text">2주 일정</p>
        <div className="flex flex-wrap gap-3 text-micro text-muted">
          {(Object.keys(EVENT_META) as Array<keyof typeof EVENT_META>).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_META[k].color }} />
              {EVENT_META[k].label}
            </span>
          ))}
        </div>
      </div>
      <WeekRow label="이번 주" days={days.slice(0, 7)} byDay={byDay} />
      <WeekRow label="다음 주" days={days.slice(7)} byDay={byDay} />
    </section>
  );
}
