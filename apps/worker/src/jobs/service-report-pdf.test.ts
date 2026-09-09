import { describe, expect, it } from "vitest";
import { decidePdfJob, parsePdfJobPayload, stampCopyPath } from "./service-report-pdf";

// #285 D-C8 — PDF 세대(pdf_revision) 가드·직인 복사 경로 순수 로직. 렌더·스토리지는 통합 테스트.

describe("parsePdfJobPayload", () => {
  it("revision·expected_status를 읽는다", () => {
    expect(parsePdfJobPayload({ service_report_id: "r1", revision: 2, expected_status: "approved" })).toEqual({
      id: "r1",
      revision: 2,
      expectedStatus: "approved",
    });
  });

  it("구 잡(세대 정보 없음)은 revision/expected_status가 null — 행 값으로 대체한다", () => {
    expect(parsePdfJobPayload({ service_report_id: "r1" })).toEqual({ id: "r1", revision: null, expectedStatus: null });
  });

  it("service_report_id 없으면 throw", () => {
    expect(() => parsePdfJobPayload({})).toThrow(/service_report_id/);
  });
});

describe("decidePdfJob — 렌더 직전 재조회한 행과 잡 세대 대조", () => {
  const row = { status: "issued", pdf_revision: 1, pdf_url: null };

  it("세대·상태 일치 + pdf_url 없음 → render", () => {
    expect(decidePdfJob({ id: "r1", revision: 1, expectedStatus: "issued" }, row)).toEqual({ kind: "render" });
  });

  it("세대 불일치(승인으로 2세대가 됨) → discard(성공 종료)", () => {
    const d = decidePdfJob({ id: "r1", revision: 1, expectedStatus: "issued" }, { ...row, status: "approved", pdf_revision: 2 });
    expect(d.kind).toBe("discard");
  });

  it("같은 세대인데 이미 pdf_url 있음(중복 잡) → discard", () => {
    expect(decidePdfJob({ id: "r1", revision: 1, expectedStatus: "issued" }, { ...row, pdf_url: "r1/report-r1.pdf" }).kind).toBe("discard");
  });

  it("voided → discard(무효 문서는 렌더하지 않는다, 실패 아님)", () => {
    expect(decidePdfJob({ id: "r1", revision: 1, expectedStatus: "issued" }, { ...row, status: "voided" }).kind).toBe("discard");
  });

  it("draft(발행 검증 우회 의심) → throw", () => {
    expect(() => decidePdfJob({ id: "r1", revision: 0, expectedStatus: "draft" }, { ...row, status: "draft", pdf_revision: 0 })).toThrow();
  });

  it("completed도 렌더 허용(승인본 재시도 경로, F-E1)", () => {
    expect(decidePdfJob({ id: "r1", revision: 2, expectedStatus: "completed" }, { status: "completed", pdf_revision: 2, pdf_url: null }).kind).toBe("render");
  });

  it("구 잡(세대 null)은 행의 세대·상태를 그대로 쓴다", () => {
    expect(decidePdfJob({ id: "r1", revision: null, expectedStatus: null }, { status: "approved", pdf_revision: 2, pdf_url: null })).toEqual({ kind: "render" });
  });
});

describe("stampCopyPath — 직인을 리포트 폴더로 복사할 때 확장자 보존", () => {
  it("png", () => expect(stampCopyPath("r1", "u1/stamp-1757400000.png")).toBe("r1/approval-stamp.png"));
  it("jpeg", () => expect(stampCopyPath("r1", "u1/stamp-2.jpeg")).toBe("r1/approval-stamp.jpeg"));
});
