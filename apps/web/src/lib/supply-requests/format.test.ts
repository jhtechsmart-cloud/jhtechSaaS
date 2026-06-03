import { describe, expect, test } from "vitest";
import { formatBizNo, formatPhone } from "./format";

describe("formatBizNo — 3-2-5 자동 하이픈", () => {
  test("점진 입력", () => {
    expect(formatBizNo("12")).toBe("12");
    expect(formatBizNo("1234")).toBe("123-4");
    expect(formatBizNo("123456")).toBe("123-45-6");
    expect(formatBizNo("1234567890")).toBe("123-45-67890");
  });
  test("이미 하이픈/문자 섞여도 재포맷", () => {
    expect(formatBizNo("123-45-67890")).toBe("123-45-67890");
    expect(formatBizNo("704abc1234565")).toBe("704-12-34565");
  });
  test("10자리 초과는 잘림", () => {
    expect(formatBizNo("12345678901234")).toBe("123-45-67890");
  });
});

describe("formatPhone — 한국 전화 자동 하이픈", () => {
  test("휴대폰 010", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("0101234")).toBe("010-1234");
  });
  test("서울 02", () => {
    expect(formatPhone("021234567")).toBe("02-123-4567");
    expect(formatPhone("0212345678")).toBe("02-1234-5678");
  });
  test("지역번호 0XX", () => {
    expect(formatPhone("0312345678")).toBe("031-234-5678");
  });
  test("문자 섞여도 숫자만 추출", () => {
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678");
  });
});
