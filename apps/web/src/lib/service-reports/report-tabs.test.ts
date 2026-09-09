import { describe, expect, it } from "vitest";
import {
  REPORT_TABS,
  STATUS_BADGE_CLASS,
  MAIL_BADGE,
  defaultTabFor,
  kpiTabHref,
  tabMatches,
  type ReportTabRow,
} from "./report-tabs";

// #285 #C — 목록 탭 7종·KPI→탭 매핑·기본 탭(권한)·배지 톤 단일 출처(순수).
const row = (over: Partial<ReportTabRow> = {}): ReportTabRow => ({
  status: "issued",
  follow_needed: false,
  follow_resolved_at: null,
  mail_sent: false,
  ...over,
});

describe("REPORT_TABS", () => {
  it("탭 7종 순서 = 전체·승인 대기·세금계산서 미발행·메일 미발송·후속조치 대기·완료·무효", () => {
    expect(REPORT_TABS.map((t) => t.key)).toEqual([
      "all",
      "awaiting_approval",
      "awaiting_tax",
      "mail_unsent",
      "follow",
      "completed",
      "voided",
    ]);
  });
});

describe("tabMatches", () => {
  it("승인 대기 = issued만", () => {
    expect(tabMatches("awaiting_approval", row())).toBe(true);
    expect(tabMatches("awaiting_approval", row({ status: "approved" }))).toBe(false);
  });
  it("세금계산서 미발행 = approved만", () => {
    expect(tabMatches("awaiting_tax", row({ status: "approved" }))).toBe(true);
    expect(tabMatches("awaiting_tax", row({ status: "completed" }))).toBe(false);
  });
  it("메일 미발송 = approved/completed 중 sent 이력 없음(issued는 아직 발송 대상 아님)", () => {
    expect(tabMatches("mail_unsent", row({ status: "approved" }))).toBe(true);
    expect(tabMatches("mail_unsent", row({ status: "completed", mail_sent: true }))).toBe(false);
    expect(tabMatches("mail_unsent", row({ status: "issued" }))).toBe(false);
  });
  it("후속조치 대기 = 발행 이후 3상태 + follow_needed + 미처리(무효·draft 제외)", () => {
    expect(tabMatches("follow", row({ status: "completed", follow_needed: true }))).toBe(true);
    expect(tabMatches("follow", row({ status: "approved", follow_needed: true, follow_resolved_at: "2026-09-10" }))).toBe(false);
    expect(tabMatches("follow", row({ status: "voided", follow_needed: true }))).toBe(false);
    expect(tabMatches("follow", row({ status: "draft", follow_needed: true }))).toBe(false);
  });
  it("완료·무효·전체", () => {
    expect(tabMatches("completed", row({ status: "completed" }))).toBe(true);
    expect(tabMatches("voided", row({ status: "voided" }))).toBe(true);
    expect(tabMatches("all", row({ status: "draft" }))).toBe(true);
  });
});

describe("defaultTabFor — 진입 시 내 할 일 탭", () => {
  it("approve 보유 → 승인 대기, complete 보유 → 세금계산서 미발행, 둘 다면 승인 대기 우선, 그 외 전체", () => {
    expect(defaultTabFor(["service_reports.approve"])).toBe("awaiting_approval");
    expect(defaultTabFor(["service_reports.complete"])).toBe("awaiting_tax");
    expect(defaultTabFor(["service_reports.complete", "service_reports.approve"])).toBe("awaiting_approval");
    expect(defaultTabFor(["service_reports.view"])).toBe("all");
    expect(defaultTabFor(["users.manage"])).toBe("all");
  });
});

describe("kpiTabHref — KPI 박스 클릭 = 탭(D-B8)", () => {
  it("승인 대기·세금계산서·후속·완료(이번 달 프리셋)·접수(의뢰 목록)", () => {
    expect(kpiTabHref("awaiting_approval")).toBe("/admin/service-reports?tab=awaiting_approval");
    expect(kpiTabHref("awaiting_tax")).toBe("/admin/service-reports?tab=awaiting_tax");
    expect(kpiTabHref("follow_open")).toBe("/admin/service-reports?tab=follow");
    expect(kpiTabHref("completed_this_month")).toBe("/admin/service-reports?tab=completed&period=month");
    expect(kpiTabHref("received")).toBe("/admin/service-requests");
  });
});

describe("배지 톤(D-B5)", () => {
  it("승인 대기=코랄 옅음(미처리), 세금계산서 미발행=라임(주의), 완료=민트, 무효=코랄, 임시=중립", () => {
    expect(STATUS_BADGE_CLASS.issued).toContain("coral");
    expect(STATUS_BADGE_CLASS.approved).toContain("lime");
    expect(STATUS_BADGE_CLASS.completed).toContain("accent");
    expect(STATUS_BADGE_CLASS.voided).toContain("danger");
    expect(STATUS_BADGE_CLASS.draft).toContain("muted");
  });
  it("메일 배지 4종 라벨", () => {
    expect(MAIL_BADGE.none.label).toBe("미발송");
    expect(MAIL_BADGE.pending.label).toBe("발송 대기");
    expect(MAIL_BADGE.sent.label).toBe("발송됨");
    expect(MAIL_BADGE.failed.label).toBe("발송 실패");
  });
});
