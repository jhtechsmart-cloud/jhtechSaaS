import { describe, it, expect } from "vitest";
import { hasAnyContact, normalizeCompanyName, isOptionalEmailValid } from "./validation";

describe("hasAnyContact", () => {
  it("셋 다 비면 false", () => {
    expect(hasAnyContact({ mobile: "", phone1: "", phone: "" })).toBe(false);
  });
  it("공백만 있어도 false", () => {
    expect(hasAnyContact({ mobile: "   ", phone1: "", phone: "" })).toBe(false);
  });
  it("하나라도 값 있으면 true", () => {
    expect(hasAnyContact({ mobile: "010-1234-5678", phone1: "", phone: "" })).toBe(true);
    expect(hasAnyContact({ phone1: "02-123-4567" })).toBe(true);
  });
});

describe("normalizeCompanyName", () => {
  it("공백 제거 + 소문자", () => {
    expect(normalizeCompanyName(" 재현테크 ")).toBe("재현테크");
    expect(normalizeCompanyName("ABC Co")).toBe("abcco");
  });
});

describe("isOptionalEmailValid", () => {
  it("빈 값 허용", () => expect(isOptionalEmailValid("")).toBe(true));
  it("형식 맞으면 true", () => expect(isOptionalEmailValid("a@b.co.kr")).toBe(true));
  it("형식 틀리면 false", () => {
    expect(isOptionalEmailValid("foo@")).toBe(false);
    expect(isOptionalEmailValid("foo")).toBe(false);
  });
});
