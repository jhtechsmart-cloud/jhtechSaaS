"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CalendarDay, CalendarEvent, CalendarEventType, CalendarView } from "@/lib/dashboard/v2-logic";
import {
  buildCalendarDays,
  CALENDAR_EVENT_TYPES,
  CALENDAR_HIDDEN_COOKIE,
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  calendarLoadWindow,
  calendarRangeLabel,
  DEFAULT_CALENDAR_VIEW,
  extendCalendarWindow,
  groupEventsByDay,
  mergeEventsById,
  serializeHiddenEventTypes,
  shiftCalendarAnchor,
  windowCovers,
} from "@/lib/dashboard/v2-logic";
import { EVENT_META } from "@/lib/dashboard/v2-meta";
import { fetchCalendarEventsAction } from "../actions";

// 일정 캘린더(전체 폭) — 일반 달력처럼 연속 셀 그리드(hairline 구분).
// A안(클라 즉시 이동): 뷰(1주/2주/월) 전환·이전/오늘/다음은 전부 브라우저 상태로 즉시 처리(서버 왕복 0).
// 일정은 처음에 3개월치(선로딩)를 받아두고, 담은 범위를 벗어날 때만 Server Action으로 조용히 추가 조회·누적.

// 주 시작 = 일요일. 주말(일·토)은 양끝 칸.
const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type CalWindow = { start: string; endExclusive: string };

function DayCell({ day, events }: { day: CalendarDay; events: CalendarEvent[] }) {
  const [, mm, dd] = day.date.split("-").map(Number);
  // 매월 1일은 월 전환이 보이게 "M/1", 그 외는 일자만
  const dayLabel = dd === 1 ? `${mm}/1` : String(dd);
  return (
    <div
      className={`min-h-[115px] p-1.5 ${day.isToday ? "bg-mint" : "bg-surface"} ${
        day.isPast ? "opacity-55" : ""
      } ${!day.inCurrentMonth ? "opacity-40" : ""}`}
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
              style={{ backgroundColor: meta.bg, color: meta.fg }}
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

export function ScheduleCalendar({
  today,
  initialEvents,
  initialWindow,
  initialHidden = [],
}: {
  today: string;
  initialEvents: CalendarEvent[];
  initialWindow: CalWindow;
  initialHidden?: CalendarEventType[];
}) {
  // 뷰·기준일은 클라 상태 — 이동은 즉시(리렌더만). 초기값 = 기본 2주 + 오늘.
  const [view, setView] = useState<CalendarView>(DEFAULT_CALENDAR_VIEW);
  const [anchor, setAnchor] = useState(today);

  // 담아둔 일정 + 그 범위(선로딩). 범위를 벗어나면 추가 조회해 누적(캐시).
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loaded, setLoaded] = useState<CalWindow>(initialWindow);
  const [loading, setLoading] = useState(false);

  // 범례 클릭으로 종류별 표시/숨김. 선택은 쿠키에 영속(서버가 다음 렌더에서 initialHidden으로 주입).
  const [hidden, setHidden] = useState<Set<CalendarEventType>>(() => new Set(initialHidden));

  const days = buildCalendarDays(view, anchor, today);

  // 앵커가 담아둔 범위(선로딩 3개월)를 벗어나면 그 앵커 기준 3개월을 추가 조회·누적.
  useEffect(() => {
    const need = calendarLoadWindow(anchor);
    if (windowCovers(loaded, need.start, need.endExclusive)) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fetched = await fetchCalendarEventsAction(need.start, need.endExclusive);
        if (cancelled) return;
        setEvents((prev) => mergeEventsById(prev, fetched));
        setLoaded((prev) => extendCalendarWindow(prev, need));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anchor, loaded]);

  function toggle(type: CalendarEventType) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      document.cookie = `${CALENDAR_HIDDEN_COOKIE}=${serializeHiddenEventTypes(next)};path=/;max-age=31536000;samesite=lax`;
      return next;
    });
  }

  const byDay = groupEventsByDay(events.filter((e) => !hidden.has(e.type)));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-h2 font-semibold text-text">일정</p>
          <p className="text-body font-medium text-muted tabular-nums">
            {calendarRangeLabel(view, days)}
          </p>
          {loading && <span className="text-micro text-faint">불러오는 중…</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 뷰 전환(1주/2주/월) — 클라 즉시 전환. 현재 앵커 유지. */}
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5" role="group" aria-label="캘린더 표시 단위">
            {CALENDAR_VIEWS.map((v) => {
              const active = v === view;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={active}
                  className={`rounded-md px-3 py-1 text-small font-medium transition-colors ${
                    active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text"
                  }`}
                >
                  {CALENDAR_VIEW_LABELS[v]}
                </button>
              );
            })}
          </div>

          {/* 이전 / 오늘 / 다음 — 클라 즉시 이동. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftCalendarAnchor(view, a, -1))}
              aria-label="이전"
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-small font-medium text-text transition-colors hover:bg-surface-2"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setAnchor((a) => shiftCalendarAnchor(view, a, 1))}
              aria-label="다음"
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 범례 = 표시/숨김 토글 버튼. 꺼진 항목은 흐리게+취소선, 캘린더에서 해당 종류 칩이 사라짐. */}
      <div className="flex flex-wrap gap-1 text-micro text-muted">
        {CALENDAR_EVENT_TYPES.map((k) => {
          const off = hidden.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              aria-pressed={!off}
              title={off ? `${EVENT_META[k].label} 표시` : `${EVENT_META[k].label} 숨기기`}
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 transition hover:bg-surface-2 ${
                off ? "opacity-40 line-through" : ""
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_META[k].color }} />
              {EVENT_META[k].label}
            </button>
          );
        })}
      </div>

      {/* 일반 달력 그리드 — gap-px + 배경색이 hairline 셀 구분선 역할. 행 수 = days.length/7(자동).
          lg 미만(모바일)에선 7열이 뭉개지므로 가로 스크롤 + min-width로 칸 가독성 유지(데스크톱은 그대로 채움). */}
      <div data-testid="calendar-scroll" className="overflow-x-auto rounded-xl border border-row-line">
        <div className="grid min-w-[680px] grid-cols-7 gap-px bg-row-line">
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
