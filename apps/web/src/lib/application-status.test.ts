import { describe, expect, test } from "vitest";
import { APPLICATION_STATUS_META, APPLICATION_STATUSES } from "./application-status";

// DESIGN.md 색 스파인(27행): 신규 #2563EB · 배정 #7C3AED · 견적중 #D97706 · 완료(종결) #16A34A
describe("application status 색 스파인 (DESIGN.md 일치)", () => {
  test("배정=보라(#7C3AED), 견적중=앰버(#D97706) — 스왑 회귀 방지", () => {
    expect(APPLICATION_STATUS_META.assigned.color).toBe("#7C3AED");
    expect(APPLICATION_STATUS_META.quoted.color).toBe("#D97706");
  });

  test("신규=#2563EB, 완료=#16A34A", () => {
    expect(APPLICATION_STATUS_META.new.color).toBe("#2563EB");
    expect(APPLICATION_STATUS_META.closed.color).toBe("#16A34A");
  });

  test("quoted 라벨은 '견적중'(E5 전엔 '발송' 단언 금지)", () => {
    expect(APPLICATION_STATUS_META.quoted.label).toBe("견적중");
  });

  test("4개 상태 모두 메타 존재", () => {
    for (const s of APPLICATION_STATUSES) {
      expect(APPLICATION_STATUS_META[s]).toBeTruthy();
    }
  });
});
