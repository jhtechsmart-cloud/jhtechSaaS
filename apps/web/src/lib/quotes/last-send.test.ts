import { describe, expect, it } from "vitest";
import { formatLastSendLine } from "./last-send";

describe("formatLastSendLine", () => {
  it("성공 발송 → 주소·성공·KST 시각", () => {
    const line = formatLastSendLine({ to: "a@b.com", status: "sent", at: "2026-06-17T05:24:24.000Z" });
    expect(line).toContain("a@b.com");
    expect(line).toContain("성공");
    expect(line).toContain("2026.06.17"); // KST(+9) 같은 날
  });
  it("실패 발송 → 실패 표기", () => {
    const line = formatLastSendLine({ to: "a@b.com", status: "failed", at: "2026-06-17T05:24:24.000Z" });
    expect(line).toContain("실패");
  });
  it("발송 이력 없으면 null", () => {
    expect(formatLastSendLine(null)).toBeNull();
  });
});
