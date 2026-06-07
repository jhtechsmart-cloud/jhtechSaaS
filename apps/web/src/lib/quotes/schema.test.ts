import { describe, expect, test } from "vitest";
import { createManualQuotePayloadSchema } from "./schema";

const items = [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
const ok = (o: object) => createManualQuotePayloadSchema.safeParse(o).success;

describe("createManualQuotePayloadSchema — 수기 견적 입력", () => {
  test("회사명 + 장비 있으면 통과", () => {
    expect(ok({ company: "수기업체", items, options: [], status: "draft" })).toBe(true);
  });
  test("회사명 누락·빈문자열 거부", () => {
    expect(ok({ company: "", items, options: [], status: "draft" })).toBe(false);
    expect(ok({ items, options: [], status: "draft" })).toBe(false);
  });
  test("장비 0줄 거부", () => {
    expect(ok({ company: "수기업체", items: [], options: [], status: "draft" })).toBe(false);
  });
  test("선택 필드(대표자·연락처·이메일) 허용 + issued", () => {
    expect(
      ok({ company: "수기업체", ceo: "홍길동", phone: "010-1-2", email: "a@b.c", items, options: [], status: "issued" }),
    ).toBe(true);
  });
});
