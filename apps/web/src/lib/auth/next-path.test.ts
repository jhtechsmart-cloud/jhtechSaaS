import { describe, expect, test } from "vitest";
import { sanitizeNextPath } from "./next-path";

describe("sanitizeNextPath — open redirect 차단", () => {
  test("같은 앱 절대경로만 허용", () => {
    expect(sanitizeNextPath("/field")).toBe("/field");
    expect(sanitizeNextPath("/field/report?id=x&step=3")).toBe("/field/report?id=x&step=3");
  });

  test("외부·우회 경로 거부", () => {
    expect(sanitizeNextPath("https://evil.com")).toBeNull();
    expect(sanitizeNextPath("//evil.com")).toBeNull();
    expect(sanitizeNextPath("/\\evil.com")).toBeNull();
    expect(sanitizeNextPath("field")).toBeNull();
    expect(sanitizeNextPath("/a\nb")).toBeNull();
    expect(sanitizeNextPath("")).toBeNull();
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath("/" + "a".repeat(600))).toBeNull();
  });
});
