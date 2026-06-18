import { describe, expect, test } from "vitest";
import {
  buildTwoWeekDays,
  buildWeeklyUnits,
  demoUtilization,
  parseHiddenEventTypes,
  pipelineRows,
  serializeHiddenEventTypes,
  sortDayEvents,
  type CalendarEvent,
} from "./v2-logic";

describe("parseHiddenEventTypes — 캘린더 숨김 항목 쿠키 파싱", () => {
  test("빈 값·미설정이면 빈 배열(전부 표시)", () => {
    expect(parseHiddenEventTypes(undefined)).toEqual([]);
    expect(parseHiddenEventTypes("")).toEqual([]);
  });

  test("쉼표 구분 유효 키만 추출", () => {
    expect(parseHiddenEventTypes("delivery,supply")).toEqual(["delivery", "supply"]);
  });

  test("알 수 없는 키·공백·중복은 버린다", () => {
    expect(parseHiddenEventTypes("quote, bogus ,quote, ,demo")).toEqual(["quote", "demo"]);
  });

  test("serialize ↔ parse 왕복(순서는 EVENT 타입 순)", () => {
    expect(serializeHiddenEventTypes(new Set(["supply", "quote"]))).toBe("quote,supply");
    expect(parseHiddenEventTypes(serializeHiddenEventTypes(new Set(["demo"])))).toEqual(["demo"]);
  });

  test("전부 숨김도 표현 가능", () => {
    const all = serializeHiddenEventTypes(
      new Set(["quote", "service", "supply", "demo", "delivery"]),
    );
    expect(parseHiddenEventTypes(all)).toEqual([
      "quote",
      "service",
      "supply",
      "demo",
      "delivery",
    ]);
  });
});

describe("buildTwoWeekDays — 이번 주 일요일부터 14일", () => {
  test("금요일(2026-06-12) 기준: 6/7(일)~6/20(토), 오늘·지난날 표식", () => {
    const days = buildTwoWeekDays("2026-06-12");
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-06-07");
    expect(days[13].date).toBe("2026-06-20");
    expect(days[0].week).toBe("this");
    expect(days[7].week).toBe("next");
    expect(days[5]).toMatchObject({ date: "2026-06-12", isToday: true, isPast: false });
    expect(days[4].isPast).toBe(true); // 6/11(목)
    expect(days[6].isPast).toBe(false); // 6/13(토)
  });

  test("일요일 기준: 그날이 주 시작(주 시작=일)", () => {
    const days = buildTwoWeekDays("2026-06-14");
    expect(days[0].date).toBe("2026-06-14");
    expect(days[6].date).toBe("2026-06-20");
  });

  test("토요일(2026-06-13) 기준: 최대 역방향 오프셋(-6) + dow 0=일…6=토", () => {
    const days = buildTwoWeekDays("2026-06-13");
    expect(days[0].date).toBe("2026-06-07");
    expect(days[0].dow).toBe(0); // 일
    expect(days[6].dow).toBe(6); // 토
    expect(days[6]).toMatchObject({ date: "2026-06-13", isToday: true });
    expect(days[13].dow).toBe(6);
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
  test("비율·건수 (8단계, 부분 카운트는 0 폴백)", () => {
    const rows = pipelineRows({ new: 4, assigned: 2, quoted: 8, quote_sent: 0, delivered: 3, collected: 2 });
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ status: "new", count: 4, pct: 50 });
    expect(rows[2]).toMatchObject({ status: "quoted", count: 8, pct: 100 }); // 최대값
    expect(rows[3]).toMatchObject({ status: "quote_sent", count: 0, pct: 0 });
    expect(rows[4]).toMatchObject({ status: "delivered", count: 3 });
    expect(rows[5]).toMatchObject({ status: "collecting", count: 0 }); // 미지정 → 0
    expect(rows[7]).toMatchObject({ status: "closed", count: 0 });
  });
  test("전부 0이면 pct 0", () => {
    const rows = pipelineRows({ new: 0, assigned: 0, quoted: 0, quote_sent: 0, closed: 0 });
    expect(rows.every((r) => r.pct === 0)).toBe(true);
  });
});
