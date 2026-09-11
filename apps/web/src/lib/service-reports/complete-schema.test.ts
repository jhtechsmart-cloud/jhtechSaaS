import { describe, expect, it } from "vitest";
import { completeReportSchema } from "./complete-schema";

// #285 #C — 완료 모달 입력(세금계산서 상태·발행일·메모) zod. RPC 검증과 동일 규칙을 클라에서 먼저 보여준다.
describe("completeReportSchema", () => {
  it("발행함 + 발행일 + 메모 → 통과", () => {
    const r = completeReportSchema.safeParse({ tax_invoice_status: "invoiced", tax_invoice_date: "2026-09-10", memo: "9월분" });
    expect(r.success).toBe(true);
  });
  it("발행함인데 발행일 없음 → 거부(발행일 필드 오류)", () => {
    const r = completeReportSchema.safeParse({ tax_invoice_status: "invoiced", tax_invoice_date: "", memo: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "tax_invoice_date")).toBe(true);
  });
  it("불필요 → 발행일 없어도 통과, 날짜는 null로 정규화", () => {
    const r = completeReportSchema.safeParse({ tax_invoice_status: "not_required", tax_invoice_date: "", memo: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tax_invoice_date).toBeNull();
  });
  it("상태 누락·메모 500자 초과 → 거부", () => {
    expect(completeReportSchema.safeParse({ tax_invoice_status: "", tax_invoice_date: "", memo: "" }).success).toBe(false);
    expect(
      completeReportSchema.safeParse({ tax_invoice_status: "not_required", tax_invoice_date: "", memo: "가".repeat(501) }).success,
    ).toBe(false);
  });
});
