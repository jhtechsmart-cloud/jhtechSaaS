import { describe, expect, test } from "vitest";
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUSES,
  ACTIVE_APPLICATION_STATUSES,
  DONE_APPLICATION_STATUSES,
} from "./application-status";

// 8단계(2026-06-18 라이프사이클 확장): 접수·배정·견적중·견적발송·납품완료·수금중·수금완료·종료.
describe("application status 색 스파인 (8단계)", () => {
  test("배정·견적중=중립 muted — 스왑 회귀 방지", () => {
    expect(APPLICATION_STATUS_META.assigned.bg).toBe("#EEF5F2");
    expect(APPLICATION_STATUS_META.quoted.bg).toBe("#EEF5F2");
  });

  test("신규=코랄옅음(미처리), 견적발송=민트(긍정)", () => {
    expect(APPLICATION_STATUS_META.new.bg).toBe("#FDEEE8");
    expect(APPLICATION_STATUS_META.quote_sent.bg).toBe("#D9F3E9");
  });

  test("수금완료=최종 성공(파인 민트), 종료=중립(중단/종결)", () => {
    expect(APPLICATION_STATUS_META.collected.bg).toBe("#D9F3E9"); // 전체완료 = 긍정
    expect(APPLICATION_STATUS_META.collected.label).toBe("수금완료");
    expect(APPLICATION_STATUS_META.closed.bg).toBe("#EEF5F2"); // 종료 = 중립(예전 긍정에서 이동)
    expect(APPLICATION_STATUS_META.closed.label).toBe("종료");
  });

  test("신규 단계 라벨·계약완료=파랑 언어", () => {
    expect(APPLICATION_STATUS_META.delivered.label).toBe("계약완료");
    expect(APPLICATION_STATUS_META.delivered.color).toBe("#3E7BC0"); // 캘린더 납품=파랑과 일치(키·색 불변)
    expect(APPLICATION_STATUS_META.collecting.label).toBe("수금중");
  });

  test("8개 상태 모두 메타 존재", () => {
    expect(APPLICATION_STATUSES).toHaveLength(8);
    for (const s of APPLICATION_STATUSES) {
      expect(APPLICATION_STATUS_META[s]).toBeTruthy();
    }
  });

  test("진행중 = 수금완료·종료 제외 6개, 완료군 = 수금완료+종료", () => {
    expect([...ACTIVE_APPLICATION_STATUSES]).toEqual([
      "new",
      "assigned",
      "quoted",
      "quote_sent",
      "delivered",
      "collecting",
    ]);
    expect([...DONE_APPLICATION_STATUSES]).toEqual(["collected", "closed"]);
    // 진행중 ∪ 완료군 = 전체, 교집합 없음
    expect(ACTIVE_APPLICATION_STATUSES.length + DONE_APPLICATION_STATUSES.length).toBe(
      APPLICATION_STATUSES.length,
    );
  });
});
