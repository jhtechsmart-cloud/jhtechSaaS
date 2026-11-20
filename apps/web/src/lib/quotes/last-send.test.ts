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
  it("가짜 발송(토큰 미설정) → '성공'이 아니라 미발송(테스트 모드)", () => {
    const line = formatLastSendLine({ to: "a@b.com", status: "simulated", at: "2026-06-17T05:24:24.000Z" });
    expect(line).toContain("미발송(테스트 모드)");
    expect(line).not.toContain("성공");
  });
  it("발송 이력 없으면 null", () => {
    expect(formatLastSendLine(null)).toBeNull();
  });
});
