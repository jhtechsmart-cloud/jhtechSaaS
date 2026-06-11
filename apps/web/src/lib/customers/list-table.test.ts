import { describe, expect, test } from "vitest";
import { relativeTime, pageWindow, highlightParts, customerListParamsSchema } from "./list-table";

describe("relativeTime — 최근 활동 상대시간(KST)", () => {
  const now = new Date("2026-06-12T03:00:00+00:00"); // KST 12:00
  test("같은 KST 날짜 → 오늘", () => {
    expect(relativeTime("2026-06-12T00:30:00+00:00", now)).toBe("오늘");
  });
  test("하루 전 → 어제", () => {
    expect(relativeTime("2026-06-11T10:00:00+00:00", now)).toBe("어제");
  });
  test("7일 전 → N일 전", () => {
    expect(relativeTime("2026-06-05T10:00:00+00:00", now)).toBe("7일 전");
  });
  test("60일 전 → N개월 전", () => {
    expect(relativeTime("2026-04-13T10:00:00+00:00", now)).toBe("2개월 전");
  });
  test("null → null(활동 없음 표시는 UI 몫)", () => {
    expect(relativeTime(null, now)).toBeNull();
  });
});

describe("pageWindow — ‹ 1 … 6 7 8 … 31 › (현재±1, 처음 2, 끝 2)", () => {
  test("가운데 페이지: 1 2 … 6 7 8 … 30 31", () => {
    expect(pageWindow(7, 31)).toEqual([1, 2, "…", 6, 7, 8, "…", 30, 31]);
  });
  test("앞쪽 페이지는 생략 없이 이어붙임", () => {
    expect(pageWindow(2, 31)).toEqual([1, 2, 3, "…", 30, 31]);
  });
  test("끝쪽 페이지", () => {
    expect(pageWindow(30, 31)).toEqual([1, 2, "…", 29, 30, 31]);
  });
  test("페이지 적으면 전부 표시", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  test("1페이지뿐이면 [1]", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

describe("highlightParts — 검색어 <mark> 분해", () => {
  test("일치 구간을 match로 표시(대소문자 무시)", () => {
    expect(highlightParts("RGB Color", "color")).toEqual([
      { text: "RGB ", match: false },
      { text: "Color", match: true },
    ]);
  });
  test("검색어 없으면 통짜", () => {
    expect(highlightParts("수아트", "")).toEqual([{ text: "수아트", match: false }]);
  });
  test("정규식 메타문자 안전", () => {
    expect(highlightParts("a(b)c", "(b)")).toEqual([
      { text: "a", match: false },
      { text: "(b)", match: true },
      { text: "c", match: false },
    ]);
  });
});

describe("customerListParamsSchema — URL 파라미터 검증", () => {
  test("기본값: 빈 객체 → page 1, pp 50, sort last desc, quick all", () => {
    const p = customerListParamsSchema.parse({});
    expect(p).toMatchObject({ page: 1, pp: 50, sort: "last", dir: "desc", quick: "all" });
  });
  test("문자열 숫자 coerce + 허용 pp만", () => {
    expect(customerListParamsSchema.parse({ page: "3", pp: "100" })).toMatchObject({ page: 3, pp: 100 });
    expect(customerListParamsSchema.safeParse({ pp: "37" }).success).toBe(false);
  });
  test("sort·quick enum 외 거부", () => {
    expect(customerListParamsSchema.safeParse({ sort: "hack" }).success).toBe(false);
    expect(customerListParamsSchema.safeParse({ quick: "x" }).success).toBe(false);
  });
});
