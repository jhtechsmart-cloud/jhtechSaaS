import { describe, expect, test } from "vitest";
import { durationMinOf, parseTstzRange } from "./range";

describe("parseTstzRange", () => {
  test("PostgREST 원문(따옴표·공백 형식) 파싱", () => {
    const r = parseTstzRange(
      '["2026-07-01 05:00:00+00","2026-07-01 06:30:00+00")',
    );
    expect(r).toEqual({
      startIso: "2026-07-01T05:00:00+00:00",
      endIso: "2026-07-01T06:30:00+00:00",
    });
  });

  test("따옴표 없는 변형도 허용", () => {
    const r = parseTstzRange("[2026-07-01 05:00:00+00,2026-07-01 06:30:00+00)");
    expect(r?.startIso).toBe("2026-07-01T05:00:00+00:00");
  });

  test("형식 불일치 → null", () => {
    expect(parseTstzRange("not-a-range")).toBeNull();
    expect(parseTstzRange("")).toBeNull();
  });
});

describe("durationMinOf", () => {
  test("90분", () => {
    expect(
      durationMinOf("2026-07-01T05:00:00+00:00", "2026-07-01T06:30:00+00:00"),
    ).toBe(90);
  });
  test("역전/잘못된 입력 → 0", () => {
    expect(
      durationMinOf("2026-07-01T06:00:00+00:00", "2026-07-01T05:00:00+00:00"),
    ).toBe(0);
  });
});
