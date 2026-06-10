import { describe, expect, test } from "vitest";
import { renderQuoteHtml, type QuoteHtmlData } from "./quote-html";

const base: QuoteHtmlData = {
  quoteNo: "JHQ-20260607-001-V1",
  issuedDateLabel: "2026년 5월 29일",
  assigneeName: "대표 이무직",
  assigneePhone: "010-5347-8180",
  recipient: "예일아트",
  supplyPrice: 75_000_000,
  koreanAmount: "칠천오백만",
  items: [{ name: "멀티컷 에코 SG1625 Digital Cutter", qtyLabel: "1SET", unitPrice: 75_000_000, amount: 75_000_000 }],
  includedOptions: [{ name: "기본 3헤드(라우터 기본 포함)", qtyLabel: "1ea" }],
  extraOptions: [],
  specGroups: [],
  notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
  bannerTopDataUri: null,
  bannerBottomDataUri: null,
  stampDataUri: "data:image/png;base64,AAAA",
  fontDataUri: "data:font/ttf;base64,AAAA",
};

describe("renderQuoteHtml", () => {
  test("핵심 데이터가 HTML에 포함된다", () => {
    const html = renderQuoteHtml(base);
    expect(html).toContain("JHQ-20260607-001-V1");
    expect(html).toContain("예일아트");
    expect(html).toContain("일금 칠천오백만원정");
    expect(html).toContain("75,000,000");
    expect(html).toContain("멀티컷 에코 SG1625");
    expect(html).toContain("113-81-80804"); // 공급자
  });
  test("포함옵션은 '포함'으로, 추가옵션은 금액으로 렌더", () => {
    const html = renderQuoteHtml({
      ...base,
      extraOptions: [{ name: "추가 헤드", qtyLabel: "2ea", unitPrice: 1_000_000, amount: 2_000_000 }],
    });
    expect(html).toContain("기본 3헤드(라우터 기본 포함)");
    expect(html).toMatch(/포함/);
    expect(html).toContain("추가 헤드");
    expect(html).toContain("2,000,000");
  });
  test("specGroups 없으면 장비사양 섹션 미출력", () => {
    expect(renderQuoteHtml(base)).not.toContain("장비사양");
    const withSpecs = renderQuoteHtml({ ...base, specGroups: [{ group: "성능", items: [{ label: "해상도", value: "1200DPI" }] }] });
    expect(withSpecs).toContain("장비사양");
    expect(withSpecs).toContain("1200DPI");
  });
});
