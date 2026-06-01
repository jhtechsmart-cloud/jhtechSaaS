import { describe, expect, test } from "vitest";
import { companyFormSchema } from "./schema";

// 기준값: biz_no="1234567891"은 체크섬 유효(가중치 합산 결과 check digit=1).
// biz_no="" 허용(선택), biz_no="1234567890"은 check digit=1≠0이라 거부.
const base = { name: "가나", biz_no: "1234567891", ceo: "", phone: "", email: "", address: "", note: "", assignee_id: "", equipment: [] };

describe("companyFormSchema", () => {
  test("name만 있으면 통과(biz_no 선택)", () => {
    expect(companyFormSchema.safeParse({ ...base, biz_no: "" }).success).toBe(true);
  });
  test("biz_no 체크섬 불일치 거부", () => {
    // "1234567890": check digit=1이지만 마지막 자리=0 → 체크섬 불일치.
    expect(companyFormSchema.safeParse({ ...base, biz_no: "1234567890" }).success).toBe(false);
  });
  test("equipment 행: equipment_id와 label 둘 다 있으면 거부(XOR)", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "00000000-0000-0000-0000-0000000000e1", label: "x", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(false);
  });
  test("equipment 행: 둘 다 없으면 거부", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "", label: "", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(false);
  });
  test("equipment 행: label만 → 통과", () => {
    const r = companyFormSchema.safeParse({ ...base, equipment: [{ id: "", equipment_id: "", label: "단종품", serial_no: "", purchased_at: "", install_address: "" }] });
    expect(r.success).toBe(true);
  });
});
