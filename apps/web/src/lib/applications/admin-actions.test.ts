import { describe, expect, test } from "vitest";
import { applicationStatusSchema } from "./status-schema";

describe("applicationStatusSchema — status enum 검증", () => {
  test("유효 4상태 통과", () => {
    for (const s of ["new", "assigned", "quoted", "closed"]) {
      expect(applicationStatusSchema.safeParse(s).success).toBe(true);
    }
  });
  test("유효하지 않은 값 거부", () => {
    expect(applicationStatusSchema.safeParse("done").success).toBe(false);
    expect(applicationStatusSchema.safeParse("").success).toBe(false);
  });
});
