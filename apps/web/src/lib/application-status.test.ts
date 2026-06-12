import { describe, expect, test } from "vitest";
import { APPLICATION_STATUS_META, APPLICATION_STATUSES } from "./application-status";

// 5단계: 접수 #2563EB · 배정 #7C3AED · 견적중 #D97706 · 견적발송 #16A34A(발송 성공) · 완료 #3a3770(네이비 종결)
describe("application status 색 스파인 (5단계)", () => {
  test("배정·견적중=중립 muted — 스왑 회귀 방지", () => {
    expect(APPLICATION_STATUS_META.assigned.bg).toBe("#EEF5F2");
    expect(APPLICATION_STATUS_META.quoted.bg).toBe("#EEF5F2");
  });

  test("신규=코랄옅음(미처리), 견적발송·완료=민트(긍정) — 라이트 테마 3톤", () => {
    expect(APPLICATION_STATUS_META.new.bg).toBe("#FDEEE8");
    expect(APPLICATION_STATUS_META.quote_sent.bg).toBe("#D9F3E9");
    expect(APPLICATION_STATUS_META.closed.bg).toBe("#D9F3E9");
  });

  test("라벨: 견적중=작성중, 견적발송=발행됨", () => {
    expect(APPLICATION_STATUS_META.quoted.label).toBe("견적중");
    expect(APPLICATION_STATUS_META.quote_sent.label).toBe("견적발송");
  });

  test("5개 상태 모두 메타 존재", () => {
    expect(APPLICATION_STATUSES).toHaveLength(5);
    for (const s of APPLICATION_STATUSES) {
      expect(APPLICATION_STATUS_META[s]).toBeTruthy();
    }
  });
});
