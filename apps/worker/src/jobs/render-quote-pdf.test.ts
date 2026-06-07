import { describe, expect, test } from "vitest";
import { buildQuotePdf } from "./render-quote-pdf";

describe("buildQuotePdf — 최소 placeholder 견적 PDF", () => {
  test("유효한 PDF 바이트(%PDF 헤더)를 만든다", async () => {
    const pdf = await buildQuotePdf({
      quote_no: "JHQ-20260607-001-V1",
      supply_price: "55000000",
      tax_price: "5500000",
      total: "60500000",
    });
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(100);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
