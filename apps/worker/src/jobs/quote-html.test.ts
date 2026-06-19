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
  modelName: "MULTICUT ECO SG1625 Digital Cutter",
  modelFontDataUri: "data:font/ttf;base64,MODELFONT",
  quoteBgDataUri: "data:image/jpeg;base64,BG",
  topBannerDataUri: "data:image/png;base64,TOPBANNER",
  companyLogoDataUri: "data:image/png;base64,LOGO",
  deviceImageDataUri: "data:image/png;base64,DEV",
  deviceNameDataUri: "data:image/png;base64,NAME",
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
    expect(html).toContain("data:image/jpeg;base64,BG");   // 배경
    expect(html).toContain("data:image/png;base64,TOPBANNER"); // 상단 헤더 배경
    expect(html).toContain("data:image/png;base64,LOGO");  // 회사 로고
    expect(html).toContain("data:image/png;base64,DEV");   // 우하단 장비 이미지
    expect(html).toContain("data:image/png;base64,NAME");  // 좌하단 장비 네임
    expect(html).toContain("MULTICUT ECO SG1625 Digital Cutter"); // 상단 모델명
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
  test("그룹 제목('사양' 등)은 표시 안 함 — 항목/값만", () => {
    const html = renderQuoteHtml({ ...base, specGroups: [{ group: "사양", items: [{ label: "해상도", value: "1200DPI" }] }] });
    expect(html).toContain("1200DPI");
    expect(html).not.toContain('class="spec-title"'); // 그룹 제목 미렌더
  });
  test("값 없는 항목은 PDF 미포함(렌더 제외)", () => {
    const html = renderQuoteHtml({
      ...base,
      specGroups: [{ group: "성능", items: [
        { label: "해상도", value: "1200DPI" },
        { label: "빈항목", value: "  " }, // 공백만 = 값 없음
        { label: "무게", value: "" },
      ] }],
    });
    expect(html).toContain("해상도");
    expect(html).toContain("1200DPI");
    expect(html).not.toContain("빈항목");
    expect(html).not.toContain("무게");
  });
  test("모든 항목 값이 비면 장비사양 섹션 자체 미출력", () => {
    const html = renderQuoteHtml({ ...base, specGroups: [{ group: "성능", items: [{ label: "해상도", value: "" }] }] });
    expect(html).not.toContain("장비사양");
  });
  test("장비 이미지/네임 없으면 해당 요소 미출력(배경·로고는 항상)", () => {
    const html = renderQuoteHtml({ ...base, deviceImageDataUri: null, deviceNameDataUri: null });
    expect(html).toContain("data:image/jpeg;base64,BG");
    expect(html).not.toContain("data:image/png;base64,DEV");
    expect(html).not.toContain("data:image/png;base64,NAME");
  });
});
