import { describe, expect, test } from "vitest";
import { generateTempPassword } from "./password";

describe("generateTempPassword — 임시 비밀번호", () => {
  test("최소 12자 + 영문 대/소문자·숫자 포함(20회 반복)", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateTempPassword();
      expect(pw.length).toBeGreaterThanOrEqual(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
    }
  });

  test("호출마다 다른 값(랜덤)", () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
