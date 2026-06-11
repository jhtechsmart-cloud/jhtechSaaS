import { describe, expect, test } from "vitest";
import { maskBizNoTyping, maskPhoneTyping } from "./input-mask";

// 입력 중 자동 하이픈 마스킹 — 숫자만 쳐도 000-00-00000 형태로 실시간 변환.
// (blur 포맷과 별개로, 타이핑 도중에도 형태가 보이게.)
describe("maskBizNoTyping — 사업자번호 진행형 마스킹(3-2-5)", () => {
  test("완성 10자리: 1378100562 → 137-81-00562", () => {
    expect(maskBizNoTyping("1378100562")).toBe("137-81-00562");
  });
  test("입력 진행 중에도 단계별 하이픈", () => {
    expect(maskBizNoTyping("137")).toBe("137");
    expect(maskBizNoTyping("1378")).toBe("137-8");
    expect(maskBizNoTyping("13781")).toBe("137-81");
    expect(maskBizNoTyping("137810")).toBe("137-81-0");
  });
  test("이미 하이픈이 섞여 있어도 숫자만 다시 계산(붙여넣기·수정 안전)", () => {
    expect(maskBizNoTyping("137-81-00562")).toBe("137-81-00562");
    expect(maskBizNoTyping("137-8100562")).toBe("137-81-00562");
  });
  test("10자리 초과분은 잘라냄", () => {
    expect(maskBizNoTyping("13781005629999")).toBe("137-81-00562");
  });
  test("빈 입력은 빈 문자열", () => {
    expect(maskBizNoTyping("")).toBe("");
  });
});

describe("maskPhoneTyping — 전화번호 마스킹(완성 길이에서 표준 포맷)", () => {
  test("완성 번호는 표준 하이픈(공용 formatPhone 위임)", () => {
    expect(maskPhoneTyping("0212345678")).toBe("02-1234-5678");
    expect(maskPhoneTyping("01012345678")).toBe("010-1234-5678");
    expect(maskPhoneTyping("0311234567")).toBe("031-123-4567");
  });
  test("입력 진행 중(미완성)은 숫자 그대로 — 잘못된 중간 하이픈 강요 안 함", () => {
    expect(maskPhoneTyping("0101234")).toBe("0101234");
  });
  test("하이픈 섞인 입력도 숫자만 재계산", () => {
    expect(maskPhoneTyping("010-1234-5678")).toBe("010-1234-5678");
  });
  test("빈 입력은 빈 문자열", () => {
    expect(maskPhoneTyping("")).toBe("");
  });
});
