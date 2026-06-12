import { describe, expect, test } from "vitest";
import {
  displayValue,
  pickPrimaryContact,
  splitChips,
  tradeStatusOf,
} from "./detail-display";

describe("displayValue — 미입력 판정", () => {
  test("null·빈문자열·공백·'-'는 null(FieldRow가 '미입력' 렌더)", () => {
    expect(displayValue(null)).toBeNull();
    expect(displayValue(undefined)).toBeNull();
    expect(displayValue("")).toBeNull();
    expect(displayValue("   ")).toBeNull();
    expect(displayValue("-")).toBeNull();
  });
  test("값이 있으면 trim해 반환", () => {
    expect(displayValue(" 제조 도매 ")).toBe("제조 도매");
    expect(displayValue(102)).toBe("102");
  });
});

describe("pickPrimaryContact — 주 연락처 폴백(전화1→휴대폰→전화2)", () => {
  test("전화1이 있으면 전화1", () => {
    expect(pickPrimaryContact({ phone1: "02-500-3700", mobile: "010-1", phone2: "02-2" }).phone)
      .toBe("02-500-3700");
  });
  test("전화1 없으면 휴대폰, 그것도 없으면 전화2", () => {
    expect(pickPrimaryContact({ phone1: null, mobile: "010-1234-5678", phone2: "02-2" }).phone)
      .toBe("010-1234-5678");
    expect(pickPrimaryContact({ phone1: "", mobile: null, phone2: "02-123-4567" }).phone)
      .toBe("02-123-4567");
  });
  test("phone1·휴대폰·전화2 없으면 레거시 phone(연락처)으로 폴백 — 신청→고객 등록 퍼널", () => {
    expect(pickPrimaryContact({ phone1: null, mobile: null, phone2: null, phone: "031-123-4567" }).phone)
      .toBe("031-123-4567");
  });

  test("모두 없으면 null(빈 상태 표시)", () => {
    expect(pickPrimaryContact({ phone1: null, mobile: null, phone2: null, phone: null }).phone).toBeNull();
  });

  test("이메일은 단순 형식 검증 통과 시에만 mailto 허용값", () => {
    expect(pickPrimaryContact({ phone1: null, email: "a@b.com" }).email).toBe("a@b.com");
    // 헤더 주입 시도(?bcc=)는 mailto 비허용 — emailSafe=false
    expect(pickPrimaryContact({ phone1: null, email: "a@b.com?bcc=x@evil.com" }).emailSafe).toBe(false);
    expect(pickPrimaryContact({ phone1: null, email: "a@b.com" }).emailSafe).toBe(true);
  });
});

describe("splitChips — 업태 쉼표·공백 분리 → 배지 칩", () => {
  test("쉼표·공백 혼용 분리 + 중복 제거", () => {
    expect(splitChips("제조 도매")).toEqual(["제조", "도매"]);
    expect(splitChips("제조, 도소매, 제조")).toEqual(["제조", "도소매"]);
  });
  test("빈 입력은 빈 배열", () => {
    expect(splitChips(null)).toEqual([]);
    expect(splitChips("  ")).toEqual([]);
  });
});


describe("tradeStatusOf — 거래상태(이력 기반 파생)", () => {
  test("견적·장비·AS·소모품 중 하나라도 있으면 거래중", () => {
    expect(tradeStatusOf({ quotes: 1, equipment: 0, as: 0, supply: 0 })).toBe("거래중");
    expect(tradeStatusOf({ quotes: 0, equipment: 0, as: 0, supply: 2 })).toBe("거래중");
  });
  test("전부 0이면 신규", () => {
    expect(tradeStatusOf({ quotes: 0, equipment: 0, as: 0, supply: 0 })).toBe("신규");
  });
});
