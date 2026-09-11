// #285 — 서비스 리포트 상태기계 단일 출처 계약. DB CHECK·트리거 전이표·웹 배지·워커 가드가 이 값을 미러한다.
import { describe, expect, test } from "vitest";
import {
  SERVICE_REPORT_STATUSES,
  SERVICE_REPORT_FINALIZED,
  SERVICE_REPORT_MAILABLE,
  SERVICE_REPORT_STATUS_LABEL,
  TAX_INVOICE_STATUSES,
  canTransition,
} from "./service-report-status";

describe("service-report-status — 단일 출처 계약", () => {
  test("상태 5종 순서 고정(draft→issued→approved→completed, voided)", () => {
    expect([...SERVICE_REPORT_STATUSES]).toEqual(["draft", "issued", "approved", "completed", "voided"]);
  });

  test("FINALIZED = 발행 이후 유효 3종, MAILABLE = 승인 이후 2종", () => {
    expect([...SERVICE_REPORT_FINALIZED]).toEqual(["issued", "approved", "completed"]);
    expect([...SERVICE_REPORT_MAILABLE]).toEqual(["approved", "completed"]);
  });

  test("라벨은 5종 전부 한글이고 승인 대기·세금계산서 미발행 문구 고정", () => {
    for (const s of SERVICE_REPORT_STATUSES) {
      expect(/[^\x00-\x7F]/.test(SERVICE_REPORT_STATUS_LABEL[s]), s).toBe(true);
    }
    expect(SERVICE_REPORT_STATUS_LABEL.issued).toBe("승인 대기");
    expect(SERVICE_REPORT_STATUS_LABEL.approved).toBe("세금계산서 미발행");
  });

  test("전이표: 허용 5 / 금지(completed→voided, draft→approved, voided→*)", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "approved")).toBe(true);
    expect(canTransition("approved", "completed")).toBe(true);
    expect(canTransition("issued", "voided")).toBe(true);
    expect(canTransition("approved", "voided")).toBe(true);
    expect(canTransition("completed", "voided")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("issued", "completed")).toBe(false);
    expect(canTransition("voided", "issued")).toBe(false);
  });

  test("세금계산서 상태 값은 invoiced|not_required(리포트 issued와 혼동 금지)", () => {
    expect([...TAX_INVOICE_STATUSES]).toEqual(["invoiced", "not_required"]);
  });
});
