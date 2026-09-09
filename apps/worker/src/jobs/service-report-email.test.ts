import { describe, expect, it } from "vitest";
import { SERVICE_REPORT_MAILABLE, resolveSenderHiworksId } from "./service-report-email";

// #285 — 고객 메일은 승인본(approved/completed)만. 발신자 = enqueue RPC가 payload에 실은 호출자 하이웍스 ID.

describe("SERVICE_REPORT_MAILABLE", () => {
  it("approved·completed만 발송 가능, issued·voided·draft는 불가", () => {
    expect(SERVICE_REPORT_MAILABLE).toEqual(["approved", "completed"]);
    expect(SERVICE_REPORT_MAILABLE).not.toContain("issued");
  });
});

describe("resolveSenderHiworksId", () => {
  it("payload.hiworks_user_id 우선(발송 버튼 누른 사람 명의)", () => {
    expect(resolveSenderHiworksId({ hiworks_user_id: "mgmt" }, { sender_hiworks_user_id: "eng" })).toBe("mgmt");
  });
  it("payload에 없으면 리포트 기사 스냅샷으로 폴백(구 잡 호환)", () => {
    expect(resolveSenderHiworksId({}, { sender_hiworks_user_id: "eng" })).toBe("eng");
  });
  it("둘 다 없으면 빈 문자열", () => {
    expect(resolveSenderHiworksId({}, { sender_hiworks_user_id: null })).toBe("");
  });
});
