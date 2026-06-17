import { writeFile } from "node:fs/promises";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { buildReleasePdf } from "./render-release-pdf";
import { getFontDataUri } from "./assets";
import type { ReleaseHtmlData } from "./release-html";

// 로컬 시각 검증 전용(워커 잡 아님). 샘플 출고의뢰서 렌더 → /tmp 저장 → Read 도구로 대조.
async function main() {
  const data: ReleaseHtmlData = {
    seqNo: "REL-20260617-00042",
    company: "애드넷",
    deviceName: "JU-9060 (G5i 장착)",
    contactPhone: "010-3218-8850",
    installAddress: "서울 금천구 가산디지털1로 19 (대륭테크노타운 18차) 1403호",
    installAtLabel: "2026-07-01 13:30",
    issuedDateLabel: "2026년 6월 17일",
    deviceKind: "printer",
    details: ReleaseOrderDetailsSchema.parse({
      printer: { rip: "토파즈", headType: "리코 G5i 헤드", headCount: "3개", colors: ["CMYK", "화이트(W)"], inkType: "G5i용 잉크", inkQty: "색상별 1리터 + 솔루션" },
      common: { testMaterial: "정렬용 H&M용지 10장", computerPrep: true, dobi: false, disassemble: false },
      prep: { transport: ["1톤 리프트 화물차", "윙바디"], electrical: ["케이블", "예비 멀티탭 10m"], otherPrep: ["회사명판·로고·안전표시"] },
      site: { inboundPlan: "1층 하차 → 14층 설치(화물승강기)", doorType: "도어", doorSize: "충분함", power: "벽면콘센트 (단상 220V)", parking: "아파트형공장 — 지하주차장", blower: { install: true, note: "장비 기본장착형" }, compressor: { install: false, note: "" } },
    }),
    fontDataUri: await getFontDataUri(),
  };
  const pdf = await buildReleasePdf(data);
  const out = "/tmp/release-sample.pdf";
  await writeFile(out, pdf);
  console.log(`wrote ${out} (${pdf.byteLength} bytes)`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
