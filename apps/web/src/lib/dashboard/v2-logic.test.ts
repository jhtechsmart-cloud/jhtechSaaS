import { describe, expect, test } from "vitest";
import {
  buildCalendarDays,
  buildTwoWeekDays,
  buildWeeklyUnits,
  calendarLoadWindow,
  calendarRangeLabel,
  demoUtilization,
  extendCalendarWindow,
  mergeEventsById,
  parseCalendarAnchor,
  parseCalendarView,
  parseHiddenEventTypes,
  pipelineRows,
  serializeHiddenEventTypes,
  shiftCalendarAnchor,
  sortDayEvents,
  windowCovers,
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

describe("buildTwoWeekDays — 이번 주 월요일부터 14일", () => {
  test("금요일(2026-06-12) 기준: 6/8(월)~6/21(일), 오늘·지난날 표식", () => {
    const days = buildTwoWeekDays("2026-06-12");
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-06-08"); // 이번 주 월요일
    expect(days[13].date).toBe("2026-06-21"); // 다음 주 일요일
    expect(days[0].week).toBe("this");
    expect(days[7].week).toBe("next");
    expect(days[4]).toMatchObject({ date: "2026-06-12", isToday: true, isPast: false });
    expect(days[3].isPast).toBe(true); // 6/11(목)
    expect(days[5].isPast).toBe(false); // 6/13(토)
  });

  test("일요일 기준: 그 주의 마지막 날(주 시작=월)", () => {
    const days = buildTwoWeekDays("2026-06-14");
    expect(days[0].date).toBe("2026-06-08"); // 월요일이 주 시작
    expect(days[6]).toMatchObject({ date: "2026-06-14", isToday: true }); // 일요일=주 끝
  });

  test("월요일(2026-06-08) 기준: 그날이 주 시작 + dow 0=일…6=토", () => {
    const days = buildTwoWeekDays("2026-06-08");
    expect(days[0]).toMatchObject({ date: "2026-06-08", isToday: true });
    expect(days[0].dow).toBe(1); // 월
    expect(days[6].dow).toBe(0); // 일
    expect(days[5].dow).toBe(6); // 토
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

describe("parseCalendarView — 뷰 쿼리 파싱", () => {
  test("유효 값은 그대로, 그 외는 기본 2주", () => {
    expect(parseCalendarView("week")).toBe("week");
    expect(parseCalendarView("twoweek")).toBe("twoweek");
    expect(parseCalendarView("month")).toBe("month");
    expect(parseCalendarView(undefined)).toBe("twoweek");
    expect(parseCalendarView("bogus")).toBe("twoweek");
    expect(parseCalendarView(["week"])).toBe("twoweek"); // 배열은 무시
  });
});

describe("parseCalendarAnchor — 기준일 쿼리 파싱", () => {
  test("YYYY-MM-DD만 허용, 아니면 오늘", () => {
    expect(parseCalendarAnchor("2026-07-09", "2026-07-01")).toBe("2026-07-09");
    expect(parseCalendarAnchor(undefined, "2026-07-01")).toBe("2026-07-01");
    expect(parseCalendarAnchor("2026/07/09", "2026-07-01")).toBe("2026-07-01");
    expect(parseCalendarAnchor(["2026-07-09"], "2026-07-01")).toBe("2026-07-01");
  });
});

describe("buildCalendarDays — 뷰별 그리드(월요일 시작)", () => {
  // 2026-07-09 = 목요일. 그 주 월요일 = 2026-07-06.
  test("week: 앵커 주 월요일부터 7일", () => {
    const days = buildCalendarDays("week", "2026-07-09", "2026-07-09");
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-07-06");
    expect(days[6].date).toBe("2026-07-12");
    expect(days.every((d) => d.inCurrentMonth)).toBe(true);
    expect(days.find((d) => d.date === "2026-07-09")?.isToday).toBe(true);
  });

  test("twoweek: 14일(이번 주 월 ~ 다음 주 일)", () => {
    const days = buildCalendarDays("twoweek", "2026-07-09", "2026-07-09");
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-07-06");
    expect(days[13].date).toBe("2026-07-19");
  });

  test("month: 그 달을 감싸는 온전한 주(월 시작·일 끝·7 배수)", () => {
    // 2026-07: 1일=수, 31일=금. 그리드 = 6/29(월)~8/2(일) = 35일.
    const days = buildCalendarDays("month", "2026-07-20", "2026-07-09");
    expect(days.length % 7).toBe(0);
    expect(days[0].dow).toBe(1); // 월요일 시작
    expect(days[0].date).toBe("2026-06-29");
    expect(days[days.length - 1].date).toBe("2026-08-02");
    // 앵커 달(7월) 밖의 날은 흐리게 표시용 플래그
    expect(days.find((d) => d.date === "2026-06-29")?.inCurrentMonth).toBe(false);
    expect(days.find((d) => d.date === "2026-07-15")?.inCurrentMonth).toBe(true);
    expect(days.find((d) => d.date === "2026-08-02")?.inCurrentMonth).toBe(false);
  });
});

describe("shiftCalendarAnchor — 이전/다음 이동", () => {
  test("week=±7일, twoweek=±14일", () => {
    expect(shiftCalendarAnchor("week", "2026-07-09", 1)).toBe("2026-07-16");
    expect(shiftCalendarAnchor("week", "2026-07-09", -1)).toBe("2026-07-02");
    expect(shiftCalendarAnchor("twoweek", "2026-07-09", 1)).toBe("2026-07-23");
    expect(shiftCalendarAnchor("twoweek", "2026-07-09", -1)).toBe("2026-06-25");
  });

  test("month=한 달 이동, 그 달 1일로 정규화", () => {
    expect(shiftCalendarAnchor("month", "2026-07-20", 1)).toBe("2026-08-01");
    expect(shiftCalendarAnchor("month", "2026-07-20", -1)).toBe("2026-06-01");
    expect(shiftCalendarAnchor("month", "2026-12-15", 1)).toBe("2027-01-01"); // 연 넘김
    expect(shiftCalendarAnchor("month", "2026-01-10", -1)).toBe("2025-12-01");
  });
});

describe("calendarLoadWindow — 선로딩 3개월 범위", () => {
  test("앵커 기준 이전 달 1일 ~ 다음 달 다음 1일", () => {
    expect(calendarLoadWindow("2026-07-20")).toEqual({
      start: "2026-06-01",
      endExclusive: "2026-09-01",
    });
  });
  test("연 경계 처리", () => {
    expect(calendarLoadWindow("2026-01-10")).toEqual({
      start: "2025-12-01",
      endExclusive: "2026-03-01",
    });
    expect(calendarLoadWindow("2026-12-10")).toEqual({
      start: "2026-11-01",
      endExclusive: "2027-02-01",
    });
  });
});

describe("windowCovers — 범위 포함 판정", () => {
  const loaded = { start: "2026-06-01", endExclusive: "2026-09-01" };
  test("안에 들면 true, 벗어나면 false", () => {
    expect(windowCovers(loaded, "2026-07-05", "2026-07-19")).toBe(true);
    expect(windowCovers(loaded, "2026-06-01", "2026-09-01")).toBe(true); // 경계 포함
    expect(windowCovers(loaded, "2026-05-28", "2026-06-10")).toBe(false); // 왼쪽 초과
    expect(windowCovers(loaded, "2026-08-20", "2026-09-05")).toBe(false); // 오른쪽 초과
  });
});

describe("extendCalendarWindow — 담은 범위 확장", () => {
  test("겹치면 합쳐 넓힘", () => {
    expect(
      extendCalendarWindow(
        { start: "2026-06-01", endExclusive: "2026-09-01" },
        { start: "2026-07-01", endExclusive: "2026-10-01" },
      ),
    ).toEqual({ start: "2026-06-01", endExclusive: "2026-10-01" });
  });
  test("맞닿으면 병합", () => {
    expect(
      extendCalendarWindow(
        { start: "2026-06-01", endExclusive: "2026-09-01" },
        { start: "2026-09-01", endExclusive: "2026-12-01" },
      ),
    ).toEqual({ start: "2026-06-01", endExclusive: "2026-12-01" });
  });
  test("멀리 떨어지면 새 범위로 대체(간격 오인 방지)", () => {
    expect(
      extendCalendarWindow(
        { start: "2026-06-01", endExclusive: "2026-09-01" },
        { start: "2027-01-01", endExclusive: "2027-04-01" },
      ),
    ).toEqual({ start: "2027-01-01", endExclusive: "2027-04-01" });
  });
});

describe("mergeEventsById — 중복 제거 병합", () => {
  const ev = (type: CalendarEvent["type"], id: string, title: string): CalendarEvent => ({
    type,
    id,
    title,
    date: "2026-07-10",
    hm: null,
    href: "#",
  });
  test("type+id 같으면 뒤 목록으로 덮어씀, 다르면 합침", () => {
    const a = [ev("quote", "1", "old"), ev("demo", "1", "demo")];
    const b = [ev("quote", "1", "new"), ev("service", "2", "svc")];
    const merged = mergeEventsById(a, b);
    expect(merged).toHaveLength(3); // quote:1(덮어씀)·demo:1·service:2
    expect(merged.find((e) => e.type === "quote" && e.id === "1")?.title).toBe("new");
    expect(merged.some((e) => e.type === "demo" && e.id === "1")).toBe(true);
  });
});

describe("calendarRangeLabel — 범위 라벨", () => {
  test("month = YYYY년 M월", () => {
    const days = buildCalendarDays("month", "2026-07-20", "2026-07-09");
    expect(calendarRangeLabel("month", days)).toBe("2026년 7월");
  });
  test("week = 같은 달 날짜 범위", () => {
    const days = buildCalendarDays("week", "2026-07-09", "2026-07-09");
    expect(calendarRangeLabel("week", days)).toBe("2026년 7월 6–12일");
  });
  test("twoweek = 달 걸치면 월도 표기", () => {
    const days = buildCalendarDays("twoweek", "2026-06-29", "2026-06-29");
    // 6/29(월)~7/12(일)
    expect(calendarRangeLabel("twoweek", days)).toBe("2026년 6월 29일 – 7월 12일");
  });
});
