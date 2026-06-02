import { describe, expect, test } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone — 한국 전화번호 표시 포맷", () => {
  test("휴대폰 11자리 → 010-XXXX-XXXX", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("010-1234-5678")).toBe("010-1234-5678"); // 이미 포맷
  });
  test("서울 02", () => {
    expect(formatPhone("0212345678")).toBe("02-1234-5678"); // 10자리
    expect(formatPhone("021234567")).toBe("02-123-4567"); // 9자리
  });
  test("지역번호 0XX 10자리 → 0XX-XXX-XXXX", () => {
    expect(formatPhone("0311234567")).toBe("031-123-4567");
  });
  test("대표번호 8자리 → 1588-1234", () => {
    expect(formatPhone("15881234")).toBe("1588-1234");
  });
  test("빈 값·인식 불가 형태는 원본 반환", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("123")).toBe("123");
    expect(formatPhone("연락처없음")).toBe("연락처없음");
  });
});
