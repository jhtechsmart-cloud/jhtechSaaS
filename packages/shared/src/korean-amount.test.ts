import { describe, expect, test } from "vitest";
import { numberToKoreanAmount } from "./korean-amount";

describe("numberToKoreanAmount", () => {
  test("기본 변환", () => {
    expect(numberToKoreanAmount(75_000_000)).toBe("칠천오백만");
    expect(numberToKoreanAmount(48_000_000)).toBe("사천팔백만");
  });
  test("억·만 혼합", () => {
    expect(numberToKoreanAmount(120_000_000)).toBe("일억이천만");
    expect(numberToKoreanAmount(100_000_000)).toBe("일억");
  });
  test("천·백·십·일", () => {
    expect(numberToKoreanAmount(1_234)).toBe("일천이백삼십사");
    expect(numberToKoreanAmount(10_000)).toBe("일만");
  });
  test("0과 경계", () => {
    expect(numberToKoreanAmount(0)).toBe("영");
    expect(numberToKoreanAmount(5)).toBe("오");
    expect(numberToKoreanAmount(20)).toBe("이십");
  });
});
