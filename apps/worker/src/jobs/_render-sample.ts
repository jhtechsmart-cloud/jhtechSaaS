import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildQuotePdf } from "./render-quote-pdf";
import {
  getFontDataUri,
  getStampDataUri,
  getQuoteBgDataUri,
  getCompanyLogoDataUri,
  getTopBannerDataUri,
  getModelFontDataUri,
} from "./assets";
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
    // ⚠️ 최악 케이스 재현: 한글 모델명(폰트 폴백 검증) + 긴 사양(1페이지 유지 검증).
    quoteNo: "JHQ-20260615-003-V1",
    issuedDateLabel: "2026년 6월 15일",
    assigneeName: "관리자",
    assigneePhone: null,
    recipient: "주식회사 커팅",
    supplyPrice: 58_000_000,
    koreanAmount: "오천팔백만",
    items: [{ name: "플래스십 디지털 평판 커팅기", qtyLabel: "1SET", unitPrice: 50_000_000, amount: 50_000_000 }],
    includedOptions: [],
    extraOptions: [
      { name: "커팅기 칼날", qtyLabel: "10ea", unitPrice: 400_000, amount: 4_000_000 },
      { name: "날 고정 바인더", qtyLabel: "10ea", unitPrice: 200_000, amount: 2_000_000 },
      { name: "바닥 수평장치", qtyLabel: "1ea", unitPrice: 1_000_000, amount: 1_000_000 },
      { name: "기타 추가 옵션", qtyLabel: "1ea", unitPrice: 1_000_000, amount: 1_000_000 },
    ],
    specGroups: [
      {
        group: "사양",
        items: [
          { label: "구동 시스템", value: "디지털 서보 모터, 헬리컬 기어, 직선 레일, 가이드 스크류" },
          { label: "반복 정밀도", value: "±0.05mm" },
          { label: "전송 포트", value: "이더넷" },
          { label: "이동 속도", value: "2,000mm/s 최대" },
          { label: "커팅 속도", value: "2,000mm/s 최대" },
          { label: "최대 커팅 두께", value: "50mm" },
          { label: "제품 크기", value: "2,570 × 3,380 × 1,415mm (2516 모델 기준)" },
          { label: "제품 무게", value: "1,100kg" },
          { label: "", value: "1,600mm × 1,200mm" },
          { label: "", value: "1,600mm × 2,500mm" },
          { label: "", value: "1,600mm × 3,500mm" },
          { label: "", value: "1,600mm × 5,500mm" },
          { label: "", value: "2,000mm × 2,500mm" },
          { label: "", value: "2,000mm × 3,500mm" },
          { label: "", value: "2,000mm × 5,500mm" },
          { label: "", value: "3,200mm × 3,000mm" },
          { label: "전기 사양", value: "380V/220V±10% 50Hz/60Hz" },
          { label: "전기 소모량", value: "13kW" },
        ],
      },
    ],
    notes: [
      "상기금액은 부가세(V.A.T) 별도 금액입니다.",
      "본 견적서의 유효기간은 발행일로부터 1개월입니다.",
    ],
    modelName: "플래스십 디지털 평판 커팅기",
    modelFontDataUri: await getModelFontDataUri(),
    quoteBgDataUri: await getQuoteBgDataUri(),
    topBannerDataUri: await getTopBannerDataUri(),
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
