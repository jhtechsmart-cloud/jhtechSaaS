import { describe, expect, test } from "vitest";
import { formatKstDate, formatKstDateTime, formatKstKoreanDate } from "./date-kst";

// DB(timestamptz)는 UTC ISO로 내려온다. KST(+9h)로 변환해 표시해야
// 한국시간 자정~09시 발행 건의 날짜가 하루 전으로 밀리지 않는다.
describe("formatKstDate — UTC ISO → KST YYYY.MM.DD", () => {
  test("UTC 23:30 = KST 다음날 08:30 — 날짜가 하루 넘어간다", () => {
    expect(formatKstDate("2026-06-08T23:30:00+00:00")).toBe("2026.06.09");
  });

  test("UTC 05:01 = KST 14:01 — 같은 날", () => {
    expect(formatKstDate("2026-06-09T05:01:00+00:00")).toBe("2026.06.09");
  });

  test("KST 자정 경계(UTC 15:00) — 다음날 00:00", () => {
    expect(formatKstDate("2026-06-08T15:00:00+00:00")).toBe("2026.06.09");
  });

  test("연도 경계 — UTC 12-31 16:00 = KST 1-1", () => {
    expect(formatKstDate("2025-12-31T16:00:00+00:00")).toBe("2026.01.01");
  });

  test("잘못된 입력은 null", () => {
    expect(formatKstDate("not-a-date")).toBeNull();
  });

  test("타임존 오프셋 없는 문자열은 null(머신 로컬타임 해석 → KST 이중적용 방지)", () => {
    expect(formatKstDate("2026-06-09 05:01:00")).toBeNull();
    expect(formatKstDate("2026-06-09T05:01:00")).toBeNull();
  });

  test("Z 접미사(UTC)는 허용", () => {
    expect(formatKstDate("2026-06-09T05:01:00Z")).toBe("2026.06.09");
  });
});

describe("formatKstDateTime — KST 'YYYY.MM.DD · HH:mm'", () => {
  test("UTC 05:01 → '2026.06.09 · 14:01'", () => {
    expect(formatKstDateTime("2026-06-09T05:01:00+00:00")).toBe("2026.06.09 · 14:01");
  });

  test("UTC 23:30 → 다음날 '2026.06.09 · 08:30'", () => {
    expect(formatKstDateTime("2026-06-08T23:30:00+00:00")).toBe("2026.06.09 · 08:30");
  });
});

describe("formatKstKoreanDate — KST 'YYYY년 M월 D일'(견적서 PDF)", () => {
  test("UTC 23:30 → KST 다음날 — '2026년 6월 9일'", () => {
    expect(formatKstKoreanDate("2026-06-08T23:30:00+00:00")).toBe("2026년 6월 9일");
  });

  test("월·일 한 자리는 0 패딩 없이", () => {
    expect(formatKstKoreanDate("2026-01-02T03:00:00+00:00")).toBe("2026년 1월 2일");
  });
});
