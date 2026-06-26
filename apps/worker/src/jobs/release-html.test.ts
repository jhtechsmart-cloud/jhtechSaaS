import { describe, expect, it } from "vitest";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { renderReleaseHtml, type ReleaseHtmlData } from "./release-html";

// 출고의뢰서 HTML 조립 — 섹션·선택값·장비구분 분기·이스케이프·폰트 임베드.
function make(over: Partial<ReleaseHtmlData> = {}): ReleaseHtmlData {
  return {
    seqNo: "REL-20260617-00042",
    version: 1,
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

  it("두 패널 모두 렌더 — 프린터 선택 시 프린터 active·커팅기 inactive", () => {
    const html = renderReleaseHtml(make({ deviceKind: "printer" }));
    expect(html).toContain("프린터");
    expect(html).toContain("커팅기"); // 미선택 패널도 종이 양식대로 표시
    // 선택 장비 패널이 active(선택됨), 고정 체크박스 항목·선택 체크 렌더
    expect(html).toMatch(/panel active[\s\S]*프린터[\s\S]*선택됨/);
    expect(html).toContain("토파즈");
    expect(html).toContain("CMYK");
    expect(html).toContain("화이트(W)");
    // 고정 옵션은 미선택도 칩으로 노출(체크박스 양식)
    expect(html).toContain("바니쉬");
    // 추가 옵션 '기타'(RIP)·'프라이머'(칼라)도 칩으로 노출
    expect(html).toContain("기타");
    expect(html).toContain("프라이머");
  });

  it("RIP '기타' 선택 시 직접입력값 출력, 칼라 직접입력값 출력", () => {
    const html = renderReleaseHtml(
      make({
        deviceKind: "printer",
        details: ReleaseOrderDetailsSchema.parse({
          printer: { rip: "기타", ripOther: "커스텀RIP X", colors: ["프라이머"], colorsOther: "스팟 화이트" },
        }),
      }),
    );
    expect(html).toContain("커스텀RIP X"); // 제공 RIP(기타) 직접입력
    expect(html).toContain("스팟 화이트"); // 칼라 직접입력
  });

  it("RIP가 '기타'가 아니면 ripOther는 출력 안 함", () => {
    const html = renderReleaseHtml(
      make({
        deviceKind: "printer",
        details: ReleaseOrderDetailsSchema.parse({ printer: { rip: "토파즈", ripOther: "안나옴값" } }),
      }),
    );
    expect(html).not.toContain("안나옴값");
  });

  it("커팅기 선택 시 커팅기 패널 active + 선택 툴 체크", () => {
    const html = renderReleaseHtml(
      make({
        deviceKind: "cutter",
        details: ReleaseOrderDetailsSchema.parse({ cutter: { tools: ["기본툴", "RCT(로터리)"], camera: ["내장형"] } }),
      }),
    );
    expect(html).toMatch(/panel active[\s\S]*커팅기[\s\S]*선택됨/);
    expect(html).toContain("기본툴");
    expect(html).toContain("RCT(로터리)");
    expect(html).toContain("내장형");
  });

  it("준비사항·현장정보 체크박스·설치 토글 렌더", () => {
    const html = renderReleaseHtml(make());
    expect(html).toContain("윙바디");
    expect(html).toContain("단상 220V");
    expect(html).toContain("기본장착"); // 링블로워 note
    // 선택 항목은 chk on(✓)으로 렌더
    expect(html).toMatch(/chk on[\s\S]*윙바디/);
  });

  it("메모/특이사항 — 있으면 섹션·내용(줄바꿈→br) 렌더, 없으면 섹션 미출력", () => {
    const withMemo = renderReleaseHtml(
      make({ details: ReleaseOrderDetailsSchema.parse({ memo: "분해 입고 필요\n사다리차 예약" }) }),
    );
    expect(withMemo).toContain("메모/특이사항");
    expect(withMemo).toContain("분해 입고 필요");
    expect(withMemo).toContain("<br>"); // 줄바꿈 보존
    expect(renderReleaseHtml(make())).not.toContain("메모/특이사항"); // 메모 없으면 미출력
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
