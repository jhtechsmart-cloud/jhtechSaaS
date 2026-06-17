import { describe, expect, it } from "vitest";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { renderReleaseHtml, type ReleaseHtmlData } from "./release-html";

// 출고의뢰서 HTML 조립 — 섹션·선택값·장비구분 분기·이스케이프·폰트 임베드.
function make(over: Partial<ReleaseHtmlData> = {}): ReleaseHtmlData {
  return {
    seqNo: "REL-20260617-00042",
    company: "애드넷",
    deviceName: "JU-9060",
    contactPhone: "010-1234-5678",
    installAddress: "서울 금천구 1",
    installAtLabel: "2026-07-01 13:30",
    issuedDateLabel: "2026년 6월 17일",
    deviceKind: "printer",
    details: ReleaseOrderDetailsSchema.parse({
      printer: { rip: "토파즈", colors: ["CMYK", "화이트(W)"], headType: "리코 G5i" },
      prep: { transport: ["윙바디"], electrical: ["케이블"] },
      site: { power: "단상 220V", blower: { install: true, note: "기본장착" } },
    }),
    fontDataUri: "data:font/otf;base64,AAAA",
    ...over,
  };
}

describe("renderReleaseHtml", () => {
  it("헤더·고객정보 자동채움값 포함", () => {
    const html = renderReleaseHtml(make());
    expect(html).toContain("장비출고의뢰서");
    expect(html).toContain("REL-20260617-00042");
    expect(html).toContain("애드넷");
    expect(html).toContain("JU-9060");
    expect(html).toContain("2026-07-01 13:30");
  });

  it("프린터 선택 시 프린터 블록·선택값 렌더, 커팅기 미렌더", () => {
    const html = renderReleaseHtml(make({ deviceKind: "printer" }));
    expect(html).toContain("프린터");
    expect(html).toContain("토파즈");
    expect(html).toContain("CMYK, 화이트(W)");
    expect(html).not.toContain("card-h\">커팅기");
  });

  it("커팅기 선택 시 커팅기 블록 렌더", () => {
    const html = renderReleaseHtml(
      make({
        deviceKind: "cutter",
        details: ReleaseOrderDetailsSchema.parse({ cutter: { tools: ["기본툴", "RCT(로터리)"], camera: ["내장형"] } }),
      }),
    );
    expect(html).toContain("기본툴, RCT(로터리)");
    expect(html).toContain("내장형");
  });

  it("준비사항·현장정보 선택값과 설치 토글 렌더", () => {
    const html = renderReleaseHtml(make());
    expect(html).toContain("윙바디");
    expect(html).toContain("단상 220V");
    expect(html).toContain("설치 · 기본장착"); // 링블로워 install + note
  });

  it("폰트 data-URI를 @font-face에 임베드", () => {
    const html = renderReleaseHtml(make({ fontDataUri: "data:font/otf;base64,ZZZ" }));
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/otf;base64,ZZZ");
  });

  it("HTML 특수문자 이스케이프(인젝션 방지)", () => {
    const html = renderReleaseHtml(make({ company: "<script>x</script>" }));
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
