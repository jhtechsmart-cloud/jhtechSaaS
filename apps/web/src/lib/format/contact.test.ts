import { describe, expect, test } from "vitest";
import { formatBizNo, formatPhone } from "./contact";

describe("formatBizNo — 사업자번호 10자리 하이픈", () => {
  test("10자리 숫자 → XXX-XX-XXXXX", () => {
    expect(formatBizNo("3142224034")).toBe("314-22-24034");
  });
  test("이미 하이픈 있어도 재정규화", () => {
    expect(formatBizNo("314-22-24034")).toBe("314-22-24034");
  });
  test("자리수 안 맞으면 원본 유지", () => {
    expect(formatBizNo("12345")).toBe("12345");
  });
  test("빈값·null은 빈 문자열", () => {
    expect(formatBizNo("")).toBe("");
    expect(formatBizNo(null)).toBe("");
    expect(formatBizNo(undefined)).toBe("");
  });
});

describe("formatPhone — 한국 표준 하이픈", () => {
  test("휴대폰 11자리 → 010-1234-5678", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("01062270137")).toBe("010-6227-0137");
  });
  test("지역번호 10자리(3자리 국번) → 031-123-4567", () => {
    expect(formatPhone("0311234567")).toBe("031-123-4567");
  });
  test("서울 02 9자리 → 02-123-4567", () => {
    expect(formatPhone("021234567")).toBe("02-123-4567");
  });
  test("서울 02 10자리 → 02-1234-5678", () => {
    expect(formatPhone("0212345678")).toBe("02-1234-5678");
  });
  test("대표번호 8자리 → 1577-1234", () => {
    expect(formatPhone("15771234")).toBe("1577-1234");
  });
  test("이미 하이픈 있어도 재정규화", () => {
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
  });
  test("규칙에 안 맞으면 원본 유지", () => {
    expect(formatPhone("123")).toBe("123");
  });
  test("빈값·null은 빈 문자열", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});
