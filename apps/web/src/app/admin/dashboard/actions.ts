"use server";

import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { listCalendarEvents } from "@/lib/dashboard/v2-queries";
import type { CalendarEvent } from "@/lib/dashboard/v2-logic";

// 캘린더 클라 이동이 담아둔 범위를 벗어날 때만 호출되는 추가 조회.
// 인증·RLS는 listCalendarEvents의 서버 클라이언트가 그대로 적용(콘솔 권한 게이트 + 행 스코프).

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 두 KST 날짜 사이 일수(b - a). */
function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** [start, endExclusive) 범위의 캘린더 이벤트 조회. 잘못된 입력·과도한 범위는 빈 배열. */
export async function fetchCalendarEventsAction(
  start: string,
  endExclusive: string,
): Promise<CalendarEvent[]> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return [];
  if (!DATE.test(start) || !DATE.test(endExclusive) || start >= endExclusive) return [];
  if (diffDays(start, endExclusive) > 400) return []; // ~13개월 상한(남용 방지)
  return listCalendarEvents(start, endExclusive);
}
