import { describe, expect, test } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword — 새 비밀번호 규칙(최소 8자 + 현재와 동일 금지)", () => {
  test("8자 미만은 거부", () => {
    expect(validateNewPassword("a1b2c3d", {})).toBe("비밀번호는 8자 이상이어야 합니다");
  });

  test("정확히 8자는 통과", () => {
    expect(validateNewPassword("a1b2c3d4", {})).toBeNull();
  });

  test("현재 비밀번호와 같으면 거부", () => {
    expect(validateNewPassword("samePass1", { current: "samePass1" })).toBe(
      "현재 비밀번호와 다른 비밀번호를 입력하세요",
    );
  });

  test("현재 비밀번호와 다르면 통과", () => {
    expect(validateNewPassword("newPass12", { current: "oldPass12" })).toBeNull();
  });

  test("공백을 trim하지 않는다(앞뒤 공백 포함 8자면 통과)", () => {
    expect(validateNewPassword("  abcd  ", {})).toBeNull();
  });

  test("current 미지정이면 동일성 검사 건너뜀", () => {
    expect(validateNewPassword("anything8", {})).toBeNull();
  });
});
