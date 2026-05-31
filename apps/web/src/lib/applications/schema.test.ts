import { describe, expect, test } from "vitest";
import {
  requestFormSchema,
  buildSubmitPayload,
  seqNoSchema,
  type RequestFormInput,
} from "./schema";

const valid: RequestFormInput = {
  company: "재현상사",
  ceo: "홍길동",
  biz_no: "123-45-67890",
  phone: "02-1234-5678",
  email: "a@b.com",
  address: "서울시 강남구",
  requirements: "포장기 견적 부탁드립니다",
  equipment_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
};

describe("requestFormSchema", () => {
  test("유효 입력 통과", () => {
    expect(requestFormSchema.safeParse(valid).success).toBe(true);
  });
  test("company 누락 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, company: "" }).success).toBe(false);
  });
  test("biz_no 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, biz_no: "12" }).success).toBe(false);
  });
  test("email 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });
  test("phone 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });
  test("requirements·equipment_id는 선택", () => {
    const { requirements, equipment_id, ...core } = valid;
    expect(requestFormSchema.safeParse(core).success).toBe(true);
  });
  test("equipment_id 빈 문자열(hidden input 미선택)은 통과", () => {
    expect(requestFormSchema.safeParse({ ...valid, equipment_id: "" }).success).toBe(true);
  });
});

describe("buildSubmitPayload", () => {
  test("biz_no 하이픈 제거 + fields 구성 + equipment_name 병합", () => {
    const p = buildSubmitPayload(requestFormSchema.parse(valid), "포장기A");
    expect(p.biz_no).toBe("1234567890");
    expect(p.company).toBe("재현상사");
    expect(p.fields.requirements).toBe("포장기 견적 부탁드립니다");
    expect(p.fields.equipment_id).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(p.fields.equipment_name).toBe("포장기A");
  });
  test("빈 requirements·미선택 장비는 fields에서 생략", () => {
    const input = requestFormSchema.parse({
      company: "A", ceo: "B", biz_no: "1234567890", phone: "01012345678",
      email: "a@b.com", address: "주소",
    });
    const p = buildSubmitPayload(input);
    expect(p.fields.requirements).toBeUndefined();
    expect(p.fields.equipment_id).toBeUndefined();
    expect(p.fields.equipment_name).toBeUndefined();
  });
  test("phone은 정규화 없이 그대로 전달된다", () => {
    const p = buildSubmitPayload(requestFormSchema.parse(valid));
    expect(p.phone).toBe("02-1234-5678");
  });
});

describe("seqNoSchema", () => {
  test("REQ-YYYYMMDD-NNNNN 통과", () => {
    expect(seqNoSchema.safeParse("REQ-20260531-00001").success).toBe(true);
    expect(seqNoSchema.safeParse("REQ-20260531-100000").success).toBe(true);
  });
  test("형식 외 거부", () => {
    expect(seqNoSchema.safeParse("nope").success).toBe(false);
    expect(seqNoSchema.safeParse("").success).toBe(false);
  });
});
