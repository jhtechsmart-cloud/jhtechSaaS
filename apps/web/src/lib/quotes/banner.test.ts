// 의뢰 상세 상단 배너의 순수 로직 — 서버 의존 없이 단위테스트.
// 대표 견적 선택(최신 발행본 우선)·유효기간(발행일+30일, KST) 계산.
import { describe, expect, test } from "vitest";
import { pickRepresentativeQuote, computeQuoteValidity, type BannerQuote } from "./banner";

const q = (over: Partial<BannerQuote>): BannerQuote => ({
  id: "id",
  quote_no: "JHQ-20260609-001-V1",
  version: 1,
  status: "draft",
  total: "1000000",
  issued_at: null,
  ...over,
});

describe("pickRepresentativeQuote — 최신 발행본 우선, 없으면 최신 draft", () => {
  test("빈 목록은 null", () => {
    expect(pickRepresentativeQuote([])).toBeNull();
  });

  test("발행본이 있으면 발행본 중 최신 version", () => {
    const quotes = [
      q({ id: "v3", version: 3, status: "draft" }),
      q({ id: "v2", version: 2, status: "issued" }),
      q({ id: "v1", version: 1, status: "issued" }),
    ];
    expect(pickRepresentativeQuote(quotes)?.id).toBe("v2");
  });

  test("발행본이 없으면 draft 중 최신 version", () => {
    const quotes = [
      q({ id: "v1", version: 1, status: "draft" }),
      q({ id: "v2", version: 2, status: "draft" }),
    ];
    expect(pickRepresentativeQuote(quotes)?.id).toBe("v2");
  });

  test("목록 정렬 순서와 무관하게 동작", () => {
    const quotes = [
      q({ id: "v1", version: 1, status: "issued" }),
      q({ id: "v5", version: 5, status: "draft" }),
      q({ id: "v3", version: 3, status: "issued" }),
    ];
    expect(pickRepresentativeQuote(quotes)?.id).toBe("v3");
  });
});

describe("computeQuoteValidity — 발행일+15일 (KST 표시전용)", () => {
  test("미발행(issued_at null)이면 null", () => {
    expect(computeQuoteValidity(null, new Date("2026-06-09T00:00:00+09:00"))).toBeNull();
  });

  test("발행일+15일을 KST YYYY-MM-DD로 표시", () => {
    // 발행 2026-06-09(KST) → 만료 2026-06-24(KST)
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-09T10:00:00+09:00"));
    expect(v?.validUntilLabel).toBe("2026-06-24");
  });

  test("오늘이 발행일이면 D-15(만료까지 15일)", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-09T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(15);
  });

  test("만료일 당일이면 D-0", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-24T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(0);
  });

  test("만료 후면 음수(지남)", () => {
    const v = computeQuoteValidity("2026-06-09T01:00:00+09:00", new Date("2026-06-27T10:00:00+09:00"));
    expect(v?.daysLeft).toBe(-3);
  });

  test("UTC 자정 직전 발행도 KST 날짜로 정확히 계산", () => {
    // 2026-06-09T14:30:00Z = 2026-06-09 23:30 KST → 만료 2026-06-24 KST
    const v = computeQuoteValidity("2026-06-09T14:30:00Z", new Date("2026-06-09T15:00:00Z"));
    expect(v?.validUntilLabel).toBe("2026-06-24");
  });
});
