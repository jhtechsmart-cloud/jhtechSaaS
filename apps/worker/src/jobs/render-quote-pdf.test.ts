import { describe, expect, test, afterAll } from "vitest";
import { buildQuotePdf } from "./render-quote-pdf";
import { closeBrowser } from "./browser";
import type { QuoteHtmlData } from "./quote-html";

const data: QuoteHtmlData = {
  quoteNo: "JHQ-20260607-001-V1",
  issuedDateLabel: "2026년 6월 7일",
  assigneeName: "대표 이무직",
  assigneePhone: "010-5347-8180",
  recipient: "테스트상사",
  supplyPrice: 55_000_000,
  koreanAmount: "오천오백만",
  items: [{ name: "테스트 장비", qtyLabel: "1SET", unitPrice: 55_000_000, amount: 55_000_000 }],
  includedOptions: [],
  extraOptions: [],
  specGroups: [],
  notes: ["부가세 별도"],
  modelName: "테스트 장비",
  modelFontDataUri: "data:font/ttf;base64,AAAA",
  quoteBgDataUri: "data:image/png;base64,iVBORw0KGgo=",
  topBannerDataUri: "data:image/png;base64,iVBORw0KGgo=",
  companyLogoDataUri: "data:image/png;base64,iVBORw0KGgo=",
  deviceImageDataUri: null,
  deviceNameDataUri: null,
  stampDataUri: "data:image/png;base64,iVBORw0KGgo=",
  fontDataUri: "data:font/ttf;base64,AAAA",
};

afterAll(async () => {
  await closeBrowser();
});

describe("buildQuotePdf — Puppeteer 렌더", () => {
  test("유효한 PDF 바이트(%PDF 헤더)를 만든다", async () => {
    const pdf = await buildQuotePdf(data);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  }, 30_000);
});
