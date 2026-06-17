import { describe, expect, it } from "vitest";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { normalizeDetailsForKind, toggleArrayValue } from "./form";

// 출고의뢰서 작성 폼 순수 로직 — device_kind 토글·체크박스 배열 토글.
// 화면 상태는 details 구조와 거의 1:1. 저장 권위는 서버 RPC(여기선 표시·페이로드 정규화만).

describe("toggleArrayValue — 체크박스 배열 토글", () => {
  it("없으면 추가(순서 보존)", () => {
    expect(toggleArrayValue(["CMYK"], "화이트(W)")).toEqual(["CMYK", "화이트(W)"]);
  });
  it("있으면 제거", () => {
    expect(toggleArrayValue(["CMYK", "화이트(W)"], "CMYK")).toEqual(["화이트(W)"]);
  });
  it("빈 배열에 추가", () => {
    expect(toggleArrayValue([], "토파즈")).toEqual(["토파즈"]);
  });
});

describe("normalizeDetailsForKind — 선택 안 된 장비는 null", () => {
  const base = ReleaseOrderDetailsSchema.parse({});

  it("printer 선택 시 printer는 객체, cutter는 null", () => {
    const out = normalizeDetailsForKind(base, "printer");
    expect(out.printer).not.toBeNull();
    expect(out.cutter).toBeNull();
  });

  it("cutter 선택 시 cutter는 객체, printer는 null", () => {
    const out = normalizeDetailsForKind(base, "cutter");
    expect(out.cutter).not.toBeNull();
    expect(out.printer).toBeNull();
  });

  it("이미 채워진 printer 입력값은 보존하며 cutter만 null로", () => {
    const filled = ReleaseOrderDetailsSchema.parse({
      printer: { rip: "토파즈", colors: ["CMYK"] },
      cutter: { tools: ["기본툴"] },
    });
    const out = normalizeDetailsForKind(filled, "printer");
    expect(out.printer?.rip).toBe("토파즈");
    expect(out.printer?.colors).toEqual(["CMYK"]);
    expect(out.cutter).toBeNull();
  });

  it("공통·준비·현장 섹션은 device_kind와 무관하게 유지", () => {
    const filled = ReleaseOrderDetailsSchema.parse({
      common: { testMaterial: "H&M용지 10장" },
      prep: { transport: ["윙바디"] },
      site: { power: "단상 220V" },
    });
    const out = normalizeDetailsForKind(filled, "cutter");
    expect(out.common.testMaterial).toBe("H&M용지 10장");
    expect(out.prep.transport).toEqual(["윙바디"]);
    expect(out.site.power).toBe("단상 220V");
  });
});
