import { describe, expect, it, test } from "vitest";
import { companyFormSchema, makeCompanyFormSchema } from "./schema";

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

// Task 9 — 이관 고객 수정 그런더링(grandfather): 기존 고객 수정은 원본 대비 미변경/원래 빈 값이면 통과.
describe("makeCompanyFormSchema edit 그런더링", () => {
  // 이관 원본 — 체크섬 무효 사업자번호 + 빈 대표자/주소 + 연락처 없음(엑셀 이관 전형 케이스).
  const legacyOriginal = { bizNo: "1234567890", ceo: "", address: "", hasContact: false };

  it("사업자번호를 안 바꾸면(정규화 동일) 체크섬 무효라도 통과", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(true);
  });

  it("사업자번호를 유효한 새 값으로 바꾸면 통과", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: validBiz, ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(true);
  });

  it("사업자번호를 체크섬 무효인 새 값으로 바꾸면 실패", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    // validBiz의 체크자릿수만 하나 틀려 체크섬 무효(원본과도 다른 값 — 그런더링 미적용 대상).
    const r = schema.safeParse({ ...base, biz_no: "220-81-62518", ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(false);
  });

  it("원본 대표자가 비어 있었으면 대표자 공란 저장 허용", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "서울시 …", mobile: "010-1234-5678", phone1: "", phone: "" });
    expect(r.success).toBe(true);
  });

  it("원본 주소가 비어 있었으면 주소 공란 저장 허용", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "홍길동", address: "", mobile: "010-1234-5678", phone1: "", phone: "" });
    expect(r.success).toBe(true);
  });

  it("원본 연락처가 하나도 없었으면 연락처 전부 공란 저장 허용", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "홍길동", address: "서울시 …", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(true);
  });

  it("원본 대표자가 있었으면(비우기 방지) 대표자 비우면 실패", () => {
    const schema = makeCompanyFormSchema({ ...legacyOriginal, ceo: "홍길동" });
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(false);
  });

  it("원본 주소가 있었으면(비우기 방지) 주소 비우면 실패", () => {
    const schema = makeCompanyFormSchema({ ...legacyOriginal, address: "서울시 …" });
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(false);
  });

  it("원본 연락처가 있었으면(비우기 방지) 연락처 전부 비우면 실패", () => {
    const schema = makeCompanyFormSchema({ ...legacyOriginal, hasContact: true });
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "", mobile: "", phone1: "", phone: "" });
    expect(r.success).toBe(false);
  });

  it("이메일 형식은 edit에서도 값이 있으면 검증(그런더링 대상 아님)", () => {
    const schema = makeCompanyFormSchema(legacyOriginal);
    const r = schema.safeParse({ ...base, biz_no: "123-45-67890", ceo: "", address: "", mobile: "", phone1: "", phone: "", email: "foo@" });
    expect(r.success).toBe(false);
  });

  it("신규(companyFormSchema, edit 없음)는 기존 엄격 규칙 그대로 — 대표자 없으면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: validBiz, ceo: "" }).success).toBe(false);
  });

  it("신규(companyFormSchema, edit 없음)는 기존 엄격 규칙 그대로 — 사업자번호 체크섬 틀리면 실패", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "123-45-67890" }).success).toBe(false);
  });
});
