import { writeFile } from "node:fs/promises";
import { buildQuotePdf } from "./render-quote-pdf";
import {
  getFontDataUri,
  getStampDataUri,
  getQuoteBgDataUri,
  getCompanyLogoCutterDataUri,
  getCompanyLogoPrinterDataUri,
  getTopBannerDataUri,
  getModelFontDataUri,
} from "./assets";
import type { QuoteHtmlData } from "./quote-html";

// 로컬 시각 검증 전용 — 좌상단 회사로고 분기(커팅기/프린터)만 확인. 장비 자산은 비워둔다.
async function base(modelName: string, recipient: string): Promise<Omit<QuoteHtmlData, "companyLogoDataUri">> {
  return {
    quoteNo: "JHQ-20260616-001-V1",
    issuedDateLabel: "2026년 6월 16일",
    assigneeName: "관리자",
    assigneePhone: null,
    recipient,
    recipientManager: null,
    recipientTitle: null,
    supplyPrice: 30_000_000,
    koreanAmount: "삼천만",
    items: [{ name: modelName, qtyLabel: "1SET", unitPrice: 30_000_000, amount: 30_000_000 }],
    includedOptions: [],
    extraOptions: [],
    specGroups: [
      { group: "사양", items: [{ label: "테스트", value: "로고 분기 검증용 샘플" }] },
    ],
    notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
    modelName,
    modelFontDataUri: await getModelFontDataUri(),
    quoteBgDataUri: await getQuoteBgDataUri(),
    topBannerDataUri: await getTopBannerDataUri(),
    deviceImageDataUri: null,
    deviceNameDataUri: null,
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };
}

async function main() {
  const printer: QuoteHtmlData = {
    ...(await base("롤 UV 프린터 XTRA R16", "주식회사 프린터")),
    companyLogoDataUri: await getCompanyLogoPrinterDataUri(),
  };
  const cutter: QuoteHtmlData = {
    ...(await base("디지털 평판 커팅기 SG1625", "주식회사 커팅")),
    companyLogoDataUri: await getCompanyLogoCutterDataUri(),
  };
  await writeFile("/tmp/logo-printer.pdf", await buildQuotePdf(printer));
  await writeFile("/tmp/logo-cutter.pdf", await buildQuotePdf(cutter));
  console.log("wrote /tmp/logo-printer.pdf, /tmp/logo-cutter.pdf");
}

main().then(() => process.exit(0));
