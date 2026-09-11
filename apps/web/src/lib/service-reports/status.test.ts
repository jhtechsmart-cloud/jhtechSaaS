// #285 — 웹 상태 단일 출처는 shared 재export여야 한다(웹·워커·DB가 같은 값을 본다).
import { describe, expect, it } from "vitest";
import { SERVICE_REPORT_FINALIZED, SERVICE_REPORT_STATUS_LABEL, SERVICE_REPORT_STATUSES, canTransition } from "./status";

describe("service-reports/status — shared 재export 계약", () => {
  it("상태 5종·FINALIZED 3종·라벨이 shared 값과 같다", () => {
    expect([...SERVICE_REPORT_STATUSES]).toEqual(["draft", "issued", "approved", "completed", "voided"]);
    expect([...SERVICE_REPORT_FINALIZED]).toEqual(["issued", "approved", "completed"]);
    expect(SERVICE_REPORT_STATUS_LABEL.approved).toBe("세금계산서 미발행");
    expect(canTransition("completed", "voided")).toBe(false);
  });
});
