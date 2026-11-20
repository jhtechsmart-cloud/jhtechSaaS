import { describe, expect, test } from "vitest";
import { displayMailStatus } from "./display-status";

describe("displayMailStatus — 가짜 발송 구분", () => {
  test("sent + simulated=true → simulated (실제 미발송)", () => {
    expect(displayMailStatus("sent", true)).toBe("simulated");
  });
  test("sent + simulated=false/null → sent 그대로", () => {
    expect(displayMailStatus("sent", false)).toBe("sent");
    expect(displayMailStatus("sent", null)).toBe("sent");
  });
  test("sent가 아니면 simulated 여부와 무관하게 원래 상태", () => {
    expect(displayMailStatus("failed", true)).toBe("failed");
    expect(displayMailStatus("pending", true)).toBe("pending");
  });
});
