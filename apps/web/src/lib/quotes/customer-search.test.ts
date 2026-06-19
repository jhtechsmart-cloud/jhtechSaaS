import { describe, expect, test } from "vitest";
import { buildCompanySearchOr, rowToQuoteCustomer } from "./customer-search";

describe("buildCompanySearchOr", () => {
  test("빈/공백 쿼리는 null", () => {
    expect(buildCompanySearchOr("")).toBeNull();
    expect(buildCompanySearchOr("   ")).toBeNull();
  });
  test("한글 업체명은 name·ceo ilike만", () => {
    const or = buildCompanySearchOr("재현");
    expect(or).toContain("name.ilike.%재현%");
    expect(or).toContain("ceo.ilike.%재현%");
    expect(or).not.toContain("biz_no");
  });
  test("숫자(3자리+)는 biz_no·phone·mobile 매칭 추가(하이픈 무시)", () => {
    const or = buildCompanySearchOr("010-1234")!;
    expect(or).toContain("biz_no.ilike.%0101234%");
    expect(or).toContain("phone.ilike.%0101234%");
    expect(or).toContain("mobile.ilike.%0101234%");
  });
  test("입력 특수문자 제거(검색어에서 콤마·괄호·LIKE 와일드카드 제거)", () => {
    // 출력 절엔 구조상 콤마(절 구분)·%(ilike 와일드카드)가 정상 포함되나, '검색어' 자체는 정제됨.
    const or = buildCompanySearchOr("a,b(c)%_")!;
    expect(or).toContain("name.ilike.%abc%"); // 검색어 a,b(c)%_ → abc
  });
});

describe("rowToQuoteCustomer", () => {
  test("phone 우선, 없으면 mobile", () => {
    expect(
      rowToQuoteCustomer({ id: "1", name: "A", ceo: "대표", phone: "02-1", mobile: "010-2", email: "a@b.c", biz_no: "1112233334" }),
    ).toEqual({ id: "1", name: "A", ceo: "대표", phone: "02-1", email: "a@b.c", bizNo: "1112233334" });
    expect(
      rowToQuoteCustomer({ id: "2", name: "B", ceo: null, phone: null, mobile: "010-9", email: null, biz_no: null }),
    ).toEqual({ id: "2", name: "B", ceo: null, phone: "010-9", email: null, bizNo: null });
  });
});
