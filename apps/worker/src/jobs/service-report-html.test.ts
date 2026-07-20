import { describe, expect, it } from "vitest";
import { renderServiceReportHtml, type ServiceReportHtmlData } from "./service-report-html";

// 서비스 리포트 HTML 조립 — 7섹션·무상 스탬프·이력·이스케이프·page-break(사진 미포함 = 1장 유지).
function make(over: Partial<ServiceReportHtmlData> = {}): ServiceReportHtmlData {
  return {
    seqNo: "SR-20260716-00007",
    issuedAtLabel: "2026-07-16 15:40",
    engineerName: "홍기사",
    engineerTitle: "기술팀 과장",
    customerName: "아트원 작업실",
    customerBizNo: "119-25-33871",
    customerTel: "02-857-4120",
    customerAddr: "서울 금천구 가산디지털1로 128",
    deviceName: "JU-2513UV UV 평판 프린터",
    deviceSerial: "JU2513-2024-0417",
    purchasedAtLabel: "2025-10-01",
    warrantyLabel: "보증기간 내 (구매 후 9개월)",
    history: [{ dateLabel: "2026-02-18", summary: "[접촉불량] SSR 접촉부 재납땜" }],
    faults: ["접촉불량", "SSR·퓨즈 불량"],
    diagnosis: "전원 24V OK. SSR 접촉부 접촉불량 확인",
    actionText: "재납땜 및 커넥터 교체, 출력 테스트 정상",
    followLabel: "조치 완료 · 후속 일정 없음",
    parts: [{ name: "SSR 모듈", qty: 2, price: 15000 }],
    visitFee: 90000,
    overtimeFee: 0,
    partsTotal: 30000,
    vat: 12000,
    total: 132000,
    isFree: false,
    freeReason: "",
    signatureDataUri: "data:image/png;base64,SIGN",
    fontDataUri: "data:font/otf;base64,FONT",
    ...over,
  };
}

describe("renderServiceReportHtml", () => {
  it("7섹션 전부 + 헤더 메타(번호·확정일시·엔지니어)", () => {
    const html = renderServiceReportHtml(make());
    for (const h of [
      "1. 고객 정보",
      "2. 장비 정보",
      "3. 점검 및 고장 내역",
      "4. 조치 및 수리 내역",
      "5. 향후 일정",
      "6. 사용 부품 및 청구 내역",
      "7. 고객 확인",
    ]) {
      expect(html).toContain(h);
    }
    expect(html).toContain("SR-20260716-00007");
    expect(html).toContain("2026-07-16 15:40");
    expect(html).toMatch(/홍기사[\s\S]*기술팀 과장/);
    expect(html).toContain("보증기간 내 (구매 후 9개월)");
  });

  it("금액 표: 부품행·출장비·VAT·총계(천단위 구분)", () => {
    const html = renderServiceReportHtml(make());
    expect(html).toContain("SSR 모듈");
    expect(html).toContain("90,000");
    expect(html).toContain("12,000");
    expect(html).toContain("132,000원");
    expect(html).not.toContain("무상 처리");
  });

  it("무상: 스탬프+사유, 총계 0원", () => {
    const html = renderServiceReportHtml(
      make({ isFree: true, freeReason: "보증기간 내", visitFee: 0, partsTotal: 0, vat: 0, total: 0 }),
    );
    expect(html).toContain("무상 처리");
    expect(html).toContain("사유: 보증기간 내");
    expect(html).toContain("0원");
  });

  it("사진 블록 미렌더(1장 유지), 서명 이미지는 포함", () => {
    const html = renderServiceReportHtml(make());
    expect(html).not.toContain("수리 전 사진");
    expect(html).not.toContain("수리 후 사진");
    expect(html).toContain("data:image/png;base64,SIGN");
  });

  it("이력 없으면 '기존 A/S 이력 없음', 있으면 표", () => {
    expect(renderServiceReportHtml(make({ history: [] }))).toContain("기존 A/S 이력 없음");
    expect(renderServiceReportHtml(make())).toContain("[접촉불량] SSR 접촉부 재납땜");
  });

  it("XSS 이스케이프: 진단·고객명에 태그 삽입 불가", () => {
    const html = renderServiceReportHtml(
      make({ diagnosis: '<script>alert("x")</script>', customerName: "<b>회사</b>" }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>회사</b>");
  });

  it("page-break: 섹션 통짜 규칙(break-inside:avoid) 존재", () => {
    const html = renderServiceReportHtml(make());
    expect(html).toContain("break-inside:avoid");
    // 고객확인(서명) 섹션이 <section> 안에 있어 통짜 유지
    expect(html).toMatch(/<section>\s*<h2>7\. 고객 확인/);
  });

  it("빈 값은 — 표시, 후속조치 라벨 반영", () => {
    const html = renderServiceReportHtml(
      make({
        customerBizNo: "",
        deviceSerial: "",
        followLabel: "후속 조치 필요 — 부품 수급 후 재방문 (예정일 2026-07-30)",
      }),
    );
    expect(html).toContain('<span class="empty">—</span>');
    expect(html).toContain("부품 수급 후 재방문");
  });
});
