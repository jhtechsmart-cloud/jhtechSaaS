import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildQuotePdf } from "./render-quote-pdf";
import { getFontDataUri, getStampDataUri, getQuoteBgDataUri, getCompanyLogoDataUri } from "./assets";
import type { QuoteHtmlData } from "./quote-html";

// 로컬 시각 검증 전용 — 실제 워커 잡이 아니다. 고정 자산은 assets.ts로,
// 장비 자산은 ~/Downloads/SG1625/에서 직접 읽어 SG1625 샘플 견적을 렌더 → /tmp 저장.
async function fileUri(abs: string, mime: string): Promise<string> {
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  const dir = join(homedir(), "Downloads", "SG1625");
  const data: QuoteHtmlData = {
    quoteNo: "JHQ-20260615-001-V1",
    issuedDateLabel: "2026년 6월 15일",
    assigneeName: "대표 이무직",
    assigneePhone: "010-5347-8180",
    recipient: "예일아트",
    supplyPrice: 75_000_000,
    koreanAmount: "칠천오백만",
    items: [{ name: "멀티컷 에코 SG1625 Digital Cutter", qtyLabel: "1SET", unitPrice: 75_000_000, amount: 75_000_000 }],
    includedOptions: [{ name: "기본 3헤드(라우터 기본 포함)", qtyLabel: "1ea" }],
    extraOptions: [],
    specGroups: [
      { group: "성능", items: [{ label: "최대 작업", value: "1600×2500mm" }, { label: "속도", value: "1500mm/s" }] },
    ],
    notes: [
      "상기금액은 부가세(V.A.T) 별도 금액입니다.",
      "본 견적서의 유효기간은 발행일로부터 1개월입니다.",
    ],
    quoteBgDataUri: await getQuoteBgDataUri(),
    companyLogoDataUri: await getCompanyLogoDataUri(),
    deviceImageDataUri: await fileUri(join(dir, "4_SG1625-new.png"), "image/png"),
    deviceNameDataUri: await fileUri(join(dir, "5_멀티컷SG1625-logo.png"), "image/png"),
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };
  const pdf = await buildQuotePdf(data);
  await writeFile("/tmp/quote-sample.pdf", pdf);
  console.log("wrote /tmp/quote-sample.pdf");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
