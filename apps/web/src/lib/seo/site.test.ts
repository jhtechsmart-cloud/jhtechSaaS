import { describe, it, expect } from "vitest";
import { resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("값이 있으면 끝 슬래시 제거 후 반환", () => {
    expect(resolveSiteUrl("https://jhtech.example.com/")).toBe("https://jhtech.example.com");
    expect(resolveSiteUrl("https://jhtech.example.com")).toBe("https://jhtech.example.com");
  });
  it("빈 값·undefined면 기본값(localhost:3000)", () => {
    expect(resolveSiteUrl(undefined)).toBe("http://localhost:3000");
    expect(resolveSiteUrl("   ")).toBe("http://localhost:3000");
  });
});
