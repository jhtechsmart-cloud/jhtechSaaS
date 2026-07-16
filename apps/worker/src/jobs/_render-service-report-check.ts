import { writeFile } from "node:fs/promises";
import { buildServiceReportPdf } from "./render-service-report-pdf";
import { getFontDataUri } from "./assets";
import type { ServiceReportHtmlData } from "./service-report-html";

// 로컬 시각 검증 전용(워커 잡 아님). 유상(사진·이력 최대부하) + 무상 2종 렌더 → /tmp 저장 → Read 대조.
// 실행: pnpm --filter worker exec tsx src/jobs/_render-service-report-check.ts

// 눈에 보이는 더미 사진(회색 톤 SVG → PNG 대신 SVG data URI — 크롬 print 렌더 확인용)
function dummyPhoto(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="hsl(${hue},25%,72%)"/><text x="160" y="126" font-size="26" text-anchor="middle" fill="#234">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function dummySignature(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><path d="M20 80 C 60 20, 90 100, 130 55 S 210 30, 250 70 S 320 40, 340 60" stroke="#176455" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function main() {
  const font = await getFontDataUri();
  const base: ServiceReportHtmlData = {
    seqNo: "SR-20260716-00007",
    issuedAtLabel: "2026-07-16 15:40",
    engineerName: "이정현",
    engineerTitle: "기술팀 과장",
    customerName: "아트원 작업실",
    customerBizNo: "119-25-33871",
    customerTel: "02-857-4120",
    customerAddr: "서울 금천구 가산디지털1로 128, 우림라이온스밸리 2차 B동 1201호",
    deviceName: "JU-2513UV UV 평판 프린터",
    deviceSerial: "JU2513-2024-0417",
    purchasedAtLabel: "2025-10-01",
    warrantyLabel: "보증 만료 (구매 후 21개월)",
    history: [
      { dateLabel: "2026-02-18", summary: "[접촉불량] SSR 접촉부 재납땜, 출력 테스트 정상" },
      { dateLabel: "2025-11-02", summary: "[헤드 노즐 막힘 외 1] 헤드 클리닝 및 노즐 막힘 점검" },
      { dateLabel: "2025-08-14", summary: "[잉크라인 에어 유입] 잉크라인 에어 제거 및 댐퍼 교체" },
    ],
    faults: ["접촉불량", "SSR·퓨즈 불량", "전원부·어댑터 이상"],
    diagnosis:
      "출력 안 됨 접수 → 전원 24V OK, 어댑터 정상.\nSSR 접촉부 접촉불량 확인, 메인보드 이상 없음.\n장기 사용에 따른 접점 산화로 판단되어 부품 교체 진행.",
    actionText:
      "SSR 접촉부 재납땜 및 커넥터 교체 완료.\nSSR 모듈 2개 신품 교체 후 출력 테스트 3회 정상 확인.\n고객 입회 하에 시험 출력물 품질 확인 완료.",
    photosBefore: [dummyPhoto("수리 전 1", 10), dummyPhoto("수리 전 2", 30), dummyPhoto("수리 전 3", 50)],
    photosAfter: [dummyPhoto("수리 후 1", 150), dummyPhoto("수리 후 2", 170), dummyPhoto("수리 후 3", 190)],
    followLabel: "후속 조치 필요 — 부품 수급 후 SSR 모듈 예비품 교체 예정 (예정일 2026-07-30)",
    parts: [
      { name: "SSR 모듈", qty: 2, price: 15000 },
      { name: "커넥터 세트", qty: 1, price: 8500 },
      { name: "퓨즈 5A", qty: 4, price: 1200 },
    ],
    visitFee: 90000,
    overtimeFee: 30000,
    partsTotal: 43300,
    vat: 16330,
    total: 179630,
    isFree: false,
    freeReason: "",
    signatureDataUri: dummySignature(),
    fontDataUri: font,
  };

  const paid = await buildServiceReportPdf(base);
  await writeFile("/tmp/service-report-paid.pdf", paid);

  const free = await buildServiceReportPdf({
    ...base,
    seqNo: "SR-20260716-00008",
    warrantyLabel: "보증기간 내 (구매 후 9개월)",
    history: [],
    photosBefore: [],
    photosAfter: [],
    followLabel: "조치 완료 · 후속 일정 없음",
    parts: [],
    visitFee: 0,
    overtimeFee: 0,
    partsTotal: 0,
    vat: 0,
    total: 0,
    isFree: true,
    freeReason: "보증기간 내",
  });
  await writeFile("/tmp/service-report-free.pdf", free);

  console.log("written: /tmp/service-report-paid.pdf, /tmp/service-report-free.pdf");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
