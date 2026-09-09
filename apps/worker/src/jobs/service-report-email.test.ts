import { describe, expect, it } from "vitest";
import { resolveSenderHiworksId } from "./service-report-email";

// #285 — 발신자 = enqueue RPC가 payload에 실은 호출자 하이웍스 ID만(타인 명의·기사 스냅샷 폴백 금지).
// 상태 가드·상태기계는 service-report-email.integration.test.ts.

describe("resolveSenderHiworksId", () => {
  it("payload.hiworks_user_id(발송 버튼 누른 사람 명의)", () => {
    expect(resolveSenderHiworksId({ hiworks_user_id: "mgmt" })).toBe("mgmt");
  });
  it("payload에 없으면 빈 문자열 — 리포트 기사 스냅샷으로 폴백하지 않는다(RPC 불변식: 호출자 명의만)", () => {
    expect(resolveSenderHiworksId({})).toBe("");
    expect(resolveSenderHiworksId({ hiworks_user_id: 3 })).toBe("");
  });
});
