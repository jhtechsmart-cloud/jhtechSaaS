import { describe, expect, test } from "vitest";
import { validateBizNo, normalizeBizNo, formatBizNo } from "./biz-no";

describe("validateBizNo (국세청 체크섬)", () => {
  test("유효한 사업자번호 통과", () => {
    expect(validateBizNo("1234567891")).toBe(true);
    expect(validateBizNo("123-45-67891")).toBe(true); // 하이픈 허용
  });

  test("체크섬 불일치는 false", () => {
    expect(validateBizNo("1234567890")).toBe(false);
  });

  test("길이/형식 오류는 false", () => {
    expect(validateBizNo("123")).toBe(false);
    expect(validateBizNo("12345678a0")).toBe(false);
    expect(validateBizNo("")).toBe(false);
  });
});

describe("normalizeBizNo / formatBizNo (P-B A7)", () => {
  test("normalizeBizNo: 하이픈·공백 등 비숫자 전부 제거", () => {
    expect(normalizeBizNo("123-45-67890")).toBe("1234567890");
    expect(normalizeBizNo("123 45 67890")).toBe("1234567890");
    expect(normalizeBizNo("  123456 7890 ")).toBe("1234567890");
  });
  test("formatBizNo: 10자리 → 3-2-5 대시 포맷, 비정상은 원본 반환", () => {
    expect(formatBizNo("1234567890")).toBe("123-45-67890");
    expect(formatBizNo("123-45-67890")).toBe("123-45-67890");
    expect(formatBizNo("")).toBe("");
    expect(formatBizNo("12345")).toBe("12345");
  });
});
