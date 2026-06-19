import { describe, expect, test } from "vitest";
import { customerToFormFields } from "./customer-prefill";

describe("customerToFormFields", () => {
  test("고객 정보를 폼 필드로 매핑(null→빈문자열, id→companyId)", () => {
    expect(
      customerToFormFields({ id: "c1", name: "재현테크", ceo: "홍길동", phone: "010-1-2", email: "a@b.c", bizNo: "1112233334" }),
    ).toEqual({ company: "재현테크", ceo: "홍길동", phone: "010-1-2", email: "a@b.c", companyId: "c1" });
  });
  test("null 필드는 빈 문자열, companyId는 보존", () => {
    expect(
      customerToFormFields({ id: "c2", name: "B상사", ceo: null, phone: null, email: null, bizNo: null }),
    ).toEqual({ company: "B상사", ceo: "", phone: "", email: "", companyId: "c2" });
  });
});
