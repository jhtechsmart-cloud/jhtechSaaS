import { describe, expect, test } from "vitest";
import { addDaysKst, kstDateOf, kstHmOf, todayKst } from "./kst";

describe("kstDateOf / kstHmOf", () => {
  test("UTC ISO → KST 날짜·시각 (+9h)", () => {
    // 2026-07-01 05:00 UTC = 2026-07-01 14:00 KST
    expect(kstDateOf("2026-07-01T05:00:00+00:00")).toBe("2026-07-01");
    expect(kstHmOf("2026-07-01T05:00:00+00:00")).toBe("14:00");
  });

  test("UTC 저녁 → KST 다음날 새벽(날짜 밀림 처리)", () => {
    expect(kstDateOf("2026-07-01T16:30:00Z")).toBe("2026-07-02");
    expect(kstHmOf("2026-07-01T16:30:00Z")).toBe("01:30");
  });

  test("오프셋 없는 입력은 null(로컬타임 오해석 가드)", () => {
    expect(kstDateOf("2026-07-01T05:00:00")).toBeNull();
    expect(kstHmOf("잘못된값")).toBeNull();
  });
});

describe("todayKst", () => {
  test("UTC 15:30(=KST 다음날 00:30) 기준 날짜가 하루 앞선다", () => {
    expect(todayKst(new Date("2026-07-01T15:30:00Z"))).toBe("2026-07-02");
  });
});

describe("addDaysKst", () => {
  test("월말 넘김", () => {
    expect(addDaysKst("2026-06-30", 1)).toBe("2026-07-01");
  });
  test("음수(이전 달)", () => {
    expect(addDaysKst("2026-07-01", -1)).toBe("2026-06-30");
  });
});
