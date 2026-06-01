import { describe, expect, test } from "vitest";
import { validateBizNo } from "./biz-no";

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
