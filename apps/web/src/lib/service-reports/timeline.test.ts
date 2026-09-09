import { describe, expect, it } from "vitest";
import { buildApprovalTimeline, describeTurn } from "./timeline";

// #285 #C — 결재 타임라인 3점(확정→승인→완료) + "지금 ○○ 차례 · N일 경과"(D-B15) 순수 함수.
const now = new Date("2026-09-12T03:00:00Z"); // KST 12:00
const base = {
  status: "issued" as const,
  issued_at: "2026-09-09T05:00:00Z",
  engineer_name: "홍기사",
  approved_at: null,
  approver_name: null,
  completed_at: null,
  completed_by_name: null,
  voided_at: null,
};

describe("describeTurn", () => {
  it("issued → 승인자 차례, 확정 후 경과일", () => {
    expect(describeTurn(base, now)).toEqual({ who: "승인자(이사)", days: 3 });
  });
  it("approved → 관리부 차례, 승인 후 경과일", () => {
    expect(describeTurn({ ...base, status: "approved", approved_at: "2026-09-11T05:00:00Z" }, now)).toEqual({ who: "관리부", days: 1 });
  });
  it("completed·voided·draft → 차례 없음", () => {
    expect(describeTurn({ ...base, status: "completed" }, now)).toBeNull();
    expect(describeTurn({ ...base, status: "voided" }, now)).toBeNull();
    expect(describeTurn({ ...base, status: "draft" }, now)).toBeNull();
  });
});

describe("buildApprovalTimeline", () => {
  it("issued: 확정 done(기사·일시) / 승인 current / 완료 todo", () => {
    const t = buildApprovalTimeline(base);
    expect(t.map((s) => s.state)).toEqual(["done", "current", "todo"]);
    expect(t[0]).toMatchObject({ label: "확정", by: "홍기사", at: "2026-09-09 14:00" });
  });
  it("approved: 승인 done(승인자·일시) / 완료 current", () => {
    const t = buildApprovalTimeline({ ...base, status: "approved", approved_at: "2026-09-11T05:00:00Z", approver_name: "배이사" });
    expect(t.map((s) => s.state)).toEqual(["done", "done", "current"]);
    expect(t[1]).toMatchObject({ label: "승인", by: "배이사", at: "2026-09-11 14:00" });
  });
  it("completed: 3점 모두 done", () => {
    const t = buildApprovalTimeline({
      ...base,
      status: "completed",
      approved_at: "2026-09-11T05:00:00Z",
      completed_at: "2026-09-12T01:00:00Z",
      completed_by_name: "김관리",
    });
    expect(t.map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(t[2]).toMatchObject({ by: "김관리" });
  });
  it("voided: 도달했던 점은 done, 나머지는 void(무효 표시)", () => {
    const t = buildApprovalTimeline({ ...base, status: "voided", voided_at: "2026-09-10T00:00:00Z" });
    expect(t.map((s) => s.state)).toEqual(["done", "void", "void"]);
  });
});
