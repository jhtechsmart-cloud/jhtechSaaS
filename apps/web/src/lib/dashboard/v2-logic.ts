// 대시보드 v2 순수 로직 — 2주 캘린더 날짜·이벤트 정렬·가동률·주간 단위블록·파이프라인 비율.
// 전부 KST "YYYY-MM-DD" 문자열 기반(타임존 연산은 kst.ts에서 끝남).

import { addDaysKst } from "@/lib/format/kst";
import { APPLICATION_STATUSES } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { CLOSE_HOUR, OPEN_HOUR } from "@/lib/demo-reservations/constants";

/** 캘린더 이벤트 5종 — 견적(파인)·A/S(코랄)·소모품(라임)·데모(틸)·납품(파랑). */
export type CalendarEventType = "quote" | "service" | "supply" | "demo" | "delivery";

export interface CalendarEvent {
  type: CalendarEventType;
  id: string;
  title: string;
  date: string; // KST "YYYY-MM-DD"
  hm: string | null; // "HH:mm" — 있으면 칩에 접두 표기
  href: string;
}

export interface TwoWeekDay {
  date: string;
  /** 이번 주(첫 줄) / 다음 주(둘째 줄). */
  week: "this" | "next";
  isToday: boolean;
  isPast: boolean;
  /** 0=월 … 6=일 (표시용). */
  dow: number;
}

/** 이번 주 월요일부터 14일(이번 주 + 다음 주). 주 시작=월요일. */
export function buildTwoWeekDays(todayKst: string): TwoWeekDay[] {
  const [y, m, d] = todayKst.split("-").map(Number);
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
  const monday = addDaysKst(todayKst, mondayOffset);
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDaysKst(monday, i);
    return {
      date,
      week: i < 7 ? ("this" as const) : ("next" as const),
      isToday: date === todayKst,
      isPast: date < todayKst,
      dow: i % 7,
    };
  });
}

/** 하루 안 이벤트 정렬 — 시간 있는 것 먼저(시각 오름차순), 무시간은 뒤(제목순). */
export function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.hm && b.hm) return a.hm.localeCompare(b.hm);
    if (a.hm) return -1;
    if (b.hm) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** 날짜별 이벤트 그룹(정렬 포함). */
export function groupEventsByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  for (const [k, v] of map) map.set(k, sortDayEvents(v));
  return map;
}

/** 주간 운영시간(분) — 평일 5일 × 09:00–18:00. */
const WEEK_OPERATING_MIN = 5 * (CLOSE_HOUR - OPEN_HOUR) * 60;

/** 데모센터 주간 가동률(%) — 이번 주 예약시간 ÷ 운영시간, 100 캡. */
export function demoUtilization(reservedMin: number): number {
  if (reservedMin <= 0) return 0;
  return Math.min(100, Math.round((reservedMin / WEEK_OPERATING_MIN) * 100));
}

export type ActivityType = "quote" | "service" | "supply";

export interface WeeklyUnitDay {
  date: string;
  total: number;
  /** 표시할 블록(최대 maxPerDay개) — 1블록 = 1건. */
  units: { type: ActivityType; title?: string }[];
  /** 잘린 건수("+N" 표기, 0이면 미표기). */
  overflow: number;
}

/** 요일별 단위 블록 스택 — 막대 높이 비례 차트 금지, 블록 1개=1건. */
export function buildWeeklyUnits(
  items: { date: string; type: ActivityType; title?: string }[],
  days: string[],
  maxPerDay = 12,
): WeeklyUnitDay[] {
  return days.map((date) => {
    const dayItems = items.filter((i) => i.date === date);
    return {
      date,
      total: dayItems.length,
      units: dayItems.slice(0, maxPerDay).map(({ type, title }) => ({ type, title })),
      overflow: Math.max(0, dayItems.length - maxPerDay),
    };
  });
}

export interface PipelineRow {
  status: ApplicationStatus;
  count: number;
  /** 최대 단계 대비 비율(0~100) — 바 길이. */
  pct: number;
}

/** 견적 파이프라인 세로 행 — 단계명 + 비율 바 + 건수. */
export function pipelineRows(
  counts: Record<ApplicationStatus, number>,
): PipelineRow[] {
  const max = Math.max(...APPLICATION_STATUSES.map((s) => counts[s] ?? 0));
  return APPLICATION_STATUSES.map((status) => {
    const count = counts[status] ?? 0;
    return { status, count, pct: max === 0 ? 0 : Math.round((count / max) * 100) };
  });
}
