import { describe, expect, it } from "vitest";
import { formatDeleteBlockers, hasDeleteBlockers, type DeleteUserBlockers } from "./delete-blockers";

const zero: DeleteUserBlockers = {
  companies: 0,
  applications: 0,
  quotes: 0,
  supply_requests: 0,
  service_requests: 0,
};

describe("delete-blockers — 사용자 삭제 차단 사유", () => {
  it("전부 0이면 차단 없음", () => {
    expect(hasDeleteBlockers(zero)).toBe(false);
    expect(formatDeleteBlockers(zero)).toBe("");
  });

  it("하나라도 있으면 차단", () => {
    expect(hasDeleteBlockers({ ...zero, applications: 1 })).toBe(true);
  });

  it("0이 아닌 항목만 라벨·건수로 나열", () => {
    expect(formatDeleteBlockers({ ...zero, companies: 2, quotes: 5 })).toBe(
      "담당 고객사 2건, 담당 견적 5건",
    );
  });

  it("나열 순서는 고정(고객사→의뢰→견적→소모품→A/S)", () => {
    const full: DeleteUserBlockers = {
      companies: 1,
      applications: 1,
      quotes: 1,
      supply_requests: 1,
      service_requests: 1,
    };
    expect(formatDeleteBlockers(full)).toBe(
      "담당 고객사 1건, 담당 의뢰 1건, 담당 견적 1건, 담당 소모품 의뢰 1건, 담당 A/S 의뢰 1건",
    );
  });
});
