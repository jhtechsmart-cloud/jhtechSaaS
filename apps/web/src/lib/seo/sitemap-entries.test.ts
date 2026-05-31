import { describe, it, expect } from "vitest";
import { buildSitemapEntries } from "./sitemap-entries";

describe("buildSitemapEntries", () => {
  it("정적 경로(/, /equipment) + 장비 상세를 절대 URL로", () => {
    const e = buildSitemapEntries(["a1", "b2"], "https://jh.example.com");
    expect(e.map((x) => x.url)).toEqual([
      "https://jh.example.com/",
      "https://jh.example.com/equipment",
      "https://jh.example.com/equipment/a1",
      "https://jh.example.com/equipment/b2",
    ]);
  });
  it("장비 없으면 정적 경로만", () => {
    const e = buildSitemapEntries([], "https://jh.example.com");
    expect(e).toHaveLength(2);
  });
});
