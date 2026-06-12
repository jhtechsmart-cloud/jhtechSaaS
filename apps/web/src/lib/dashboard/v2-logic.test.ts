import { describe, expect, test } from "vitest";
import {
  buildTwoWeekDays,
  buildWeeklyUnits,
  demoUtilization,
  pipelineRows,
  sortDayEvents,
  type CalendarEvent,
} from "./v2-logic";

describe("buildTwoWeekDays — 이번 주 월요일부터 14일", () => {
  test("금요일(2026-06-12) 기준: 6/8(월)~6/21(일), 오늘·지난날 표식", () => {
    const days = buildTwoWeekDays("2026-06-12");
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-06-08");
    expect(days[13].date).toBe("2026-06-21");
    expect(days[0].week).toBe("this");
    expect(days[7].week).toBe("next");
    expect(days[4]).toMatchObject({ date: "2026-06-12", isToday: true, isPast: false });
    expect(days[3].isPast).toBe(true); // 6/11(목)
    expect(days[5].isPast).toBe(false); // 6/13(토)
  });

  test("일요일 기준: 그 주 월요일로 거슬러 시작(주 시작=월)", () => {
    const days = buildTwoWeekDays("2026-06-14");
    expect(days[0].date).toBe("2026-06-08");
    expect(days[6].date).toBe("2026-06-14");
  });
});

describe("sortDayEvents — 시간 있는 것 먼저(시각순), 무시간은 뒤", () => {
  test("정렬", () => {
    const ev = (hm: string | null, title: string): CalendarEvent => ({
      type: "demo", id: title, title, date: "2026-06-12", hm, href: "#",
    });
    const sorted = sortDayEvents([ev(null, "c"), ev("14:00", "b"), ev("09:30", "a")]);
    expect(sorted.map((e) => e.title)).toEqual(["a", "b", "c"]);
  });
});

describe("demoUtilization — 주간 가동률(운영 = 평일 5일 × 9시간)", () => {
  test("1350분 예약 = 50%", () => {
    expect(demoUtilization(1350)).toBe(50);
  });
  test("0분 = 0%, 초과는 100% 캡", () => {
    expect(demoUtilization(0)).toBe(0);
    expect(demoUtilization(99999)).toBe(100);
  });
});

describe("buildWeeklyUnits — 블록 1개=1건, 12건 초과 +N", () => {
  test("요일별 스택과 오버플로", () => {
    const items = [
      ...Array.from({ length: 14 }, () => ({ date: "2026-06-08", type: "quote" as const })),
      { date: "2026-06-09", type: "service" as const },
      { date: "2026-06-09", type: "supply" as const },
    ];
    const days = ["2026-06-08", "2026-06-09", "2026-06-10"];
    const result = buildWeeklyUnits(items, days, 12);
    expect(result[0].total).toBe(14);
    expect(result[0].units).toHaveLength(12);
    expect(result[0].overflow).toBe(2);
    expect(result[1].units.map((u) => u.type)).toEqual(["service", "supply"]);
    expect(result[2].total).toBe(0);
  });
});

describe("pipelineRows — 단계별 비율(최대값 기준 바 길이)", () => {
  test("비율·건수", () => {
    const rows = pipelineRows({ new: 4, assigned: 2, quoted: 8, quote_sent: 0, closed: 2 });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ status: "new", count: 4, pct: 50 });
    expect(rows[2]).toMatchObject({ status: "quoted", count: 8, pct: 100 });
    expect(rows[3]).toMatchObject({ status: "quote_sent", count: 0, pct: 0 });
  });
  test("전부 0이면 pct 0", () => {
    const rows = pipelineRows({ new: 0, assigned: 0, quoted: 0, quote_sent: 0, closed: 0 });
    expect(rows.every((r) => r.pct === 0)).toBe(true);
  });
});
