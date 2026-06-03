import { describe, expect, test } from "vitest";
import { collectErrorMessages } from "./error-summary";

// 폼 에러 요약 배너용 — react-hook-form errors(중첩 가능)를 사람용 메시지 배열로 평탄화.
describe("collectErrorMessages", () => {
  test("최상위 필드 에러 메시지를 모은다", () => {
    const errors = {
      address: { message: "주소를 입력하세요", type: "too_small" },
      biz_no: { message: "사업자등록번호 체크섬이 일치하지 않습니다", type: "custom" },
    };
    expect(collectErrorMessages(errors)).toEqual([
      "주소를 입력하세요",
      "사업자등록번호 체크섬이 일치하지 않습니다",
    ]);
  });

  test("중첩(배열/객체) 에러도 한 단계 들어가 수집한다", () => {
    const errors = {
      privacy_consent: { message: "개인정보 수집·이용 동의가 필요합니다", type: "literal" },
      items: { message: "소모품을 1개 이상 선택하세요", type: "too_small" },
    };
    expect(collectErrorMessages(errors)).toContain("소모품을 1개 이상 선택하세요");
    expect(collectErrorMessages(errors)).toContain("개인정보 수집·이용 동의가 필요합니다");
  });

  test("중복 메시지는 한 번만", () => {
    const errors = {
      a: { message: "필수 항목입니다" },
      b: { message: "필수 항목입니다" },
    };
    expect(collectErrorMessages(errors)).toEqual(["필수 항목입니다"]);
  });

  test("에러 없으면 빈 배열", () => {
    expect(collectErrorMessages({})).toEqual([]);
    expect(collectErrorMessages(undefined)).toEqual([]);
  });

  test("message 없는 노드는 건너뛴다", () => {
    const errors = { ref: { type: "x" }, address: { message: "주소를 입력하세요" } };
    expect(collectErrorMessages(errors)).toEqual(["주소를 입력하세요"]);
  });
});
