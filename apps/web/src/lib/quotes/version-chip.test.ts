import { describe, expect, test } from "vitest";
import { buildVersionChip } from "./version-chip";

// 처리바 버전 칩(최신/선택 버전 요약) 포맷 — 순수 로직.
describe("buildVersionChip", () => {
  const base = {
    quote_no: "JHQ-20260616-003-V3",
    version: 3,
    status: "issued",
    supply_price: "30000000",
    issued_at: "2026-06-16T05:20:00+00:00", // KST 14:20
    created_at: "2026-06-14T01:00:00+00:00",
  };

  test("발행 견적 — 버전·번호·합계·상태·KST 발급일시", () => {
    const c = buildVersionChip(base);
    expect(c.versionLabel).toBe("v3");
    expect(c.quoteNo).toBe("JHQ-20260616-003-V3");
    expect(c.totalLabel).toBe("₩30,000,000");
    expect(c.statusLabel).toBe("발행");
    expect(c.issued).toBe(true);
    expect(c.dateLabel).toBe("2026.06.16 · 14:20"); // issued_at 기준 KST
  });

  test("임시 견적 — 상태=임시, 날짜는 created_at 폴백", () => {
    const c = buildVersionChip({ ...base, status: "draft", issued_at: null });
    expect(c.statusLabel).toBe("임시");
    expect(c.issued).toBe(false);
    expect(c.dateLabel).toBe("2026.06.14 · 10:00"); // created_at 기준 KST
  });

  test("잘못된 날짜 입력 → dateLabel 빈 문자열(가드)", () => {
    const c = buildVersionChip({ ...base, issued_at: "깨진값", created_at: "" });
    expect(c.dateLabel).toBe("");
  });
});
