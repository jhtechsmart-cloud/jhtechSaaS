import { describe, expect, test } from "vitest";
import {
  formatHmRange,
  formatMonthDayWeekday,
  formatRelative,
} from "./schedule";

describe("formatMonthDayWeekday — 'M/D (요일)'", () => {
  test("2026-06-12 → 6/12 (금)", () => {
    expect(formatMonthDayWeekday("2026-06-12")).toBe("6/12 (금)");
  });
  test("2026-07-05 → 7/5 (일)", () => {
    expect(formatMonthDayWeekday("2026-07-05")).toBe("7/5 (일)");
  });
  test("형식 불일치 → null", () => {
    expect(formatMonthDayWeekday("잘못된값")).toBeNull();
  });
});

describe("formatHmRange", () => {
  test("시작·종료 → 14:00–15:30", () => {
    expect(formatHmRange("14:00", "15:30")).toBe("14:00–15:30");
  });
  test("종료 없음 → 시작만", () => {
    expect(formatHmRange("14:00", null)).toBe("14:00");
  });
  test("둘 다 없음 → null(시간 미정)", () => {
    expect(formatHmRange(null, null)).toBeNull();
  });
});

describe("formatRelative — KST 무관 epoch 차이", () => {
  const NOW = "2026-06-12T12:00:00+09:00";
  test("45초 전 → 방금 전", () => {
    expect(formatRelative("2026-06-12T11:59:15+09:00", NOW)).toBe("방금 전");
  });
  test("30분 전", () => {
    expect(formatRelative("2026-06-12T11:30:00+09:00", NOW)).toBe("30분 전");
  });
  test("5시간 전", () => {
    expect(formatRelative("2026-06-12T07:00:00+09:00", NOW)).toBe("5시간 전");
  });
  test("3일 전", () => {
    expect(formatRelative("2026-06-09T10:00:00+09:00", NOW)).toBe("3일 전");
  });
  test("잘못된 입력 → null", () => {
    expect(formatRelative("nope", NOW)).toBeNull();
  });
});
