import { describe, expect, it, test } from "vitest";
import { companyFormSchema } from "./schema";

// 유효 최소 입력 헬퍼(필수만 채움)
const base = {
  name: "재현테크", biz_no: "220-81-62517", biz_no_none: false, ceo: "홍길동",
  mobile: "010-1234-5678", phone1: "", phone: "", address: "서울시 …",
  email: "", manager: "", manager_title: "", phone2: "", fax: "",
  biz_type: "", biz_item: "", ledger_name: "", address_actual1: "",
  address_actual2: "", note: "", assignee_id: "", equipment: [],
};
// 체크섬 통과 확인됨(정규화 2208162517, check digit=7).
const validBiz = "220-81-62517";

describe("companyFormSchema 필수", () => {
  it("필수 다 채우면 통과", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz }).success).toBe(true);
  });
  it("업체명 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, name: "" }).success).toBe(false);
  });
  it("대표자 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, ceo: "" }).success).toBe(false);
  });
  it("주소 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, address: "" }).success).toBe(false);
  });
  it("연락처 셋 다 비면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, mobile: "", phone1: "", phone: "" }).success).toBe(false);
  });
  it("사업자번호 없이 none 미체크면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "", biz_no_none: false }).success).toBe(false);
  });
  it("none 체크 + 사업자번호 공란이면 통과", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "", biz_no_none: true }).success).toBe(true);
  });
  it("사업자번호 체크섬 틀리면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "123-45-67890" }).success).toBe(false);
  });
  it("이메일 형식 틀리면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, email: "foo@" }).success).toBe(false);
  });
});

// 기존(P-B #20) 장비행 XOR 회귀 커버리지 — 새 필수항목 강화에 맞춰 base를 갱신해 유지.
describe("companyFormSchema equipment 행", () => {
  test("equipment_id와 label 둘 다 있으면 거부(XOR)", () => {
    const r = companyFormSchema.safeParse({
      ...base,
      biz_no: validBiz,
      equipment: [{ id: "", equipment_id: "00000000-0000-0000-0000-0000000000e1", label: "x", serial_no: "", purchased_at: "", install_address: "" }],
    });
    expect(r.success).toBe(false);
  });
  test("둘 다 없으면 거부", () => {
    const r = companyFormSchema.safeParse({
      ...base,
      biz_no: validBiz,
      equipment: [{ id: "", equipment_id: "", label: "", serial_no: "", purchased_at: "", install_address: "" }],
    });
    expect(r.success).toBe(false);
  });
  test("label만 있으면 통과", () => {
    const r = companyFormSchema.safeParse({
      ...base,
      biz_no: validBiz,
      equipment: [{ id: "", equipment_id: "", label: "단종품", serial_no: "", purchased_at: "", install_address: "" }],
    });
    expect(r.success).toBe(true);
  });
});
