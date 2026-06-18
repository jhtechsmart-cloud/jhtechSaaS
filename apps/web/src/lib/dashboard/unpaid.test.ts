import { describe, expect, test } from "vitest";
import { buildUnpaidSummary, type UnpaidAppRow } from "./unpaid";

// 미수금 = 납품완료·수금중 의뢰. 대표 발행견적(최신 버전 issued) 공급가로 건수·총액·목록 파생.
describe("buildUnpaidSummary", () => {
  const rows: UnpaidAppRow[] = [
    {
      id: "a1", seq_no: "REQ-1", company: "가나전자", status: "delivered", assigneeName: "김영업",
      quotes: [
        { version: 1, status: "issued", supply_price: "1000000", delivery_date: "2026-08-01" },
        { version: 2, status: "issued", supply_price: "1500000", delivery_date: "2026-08-10" }, // 대표(최신)
      ],
    },
    {
      id: "a2", seq_no: "REQ-2", company: "다라상사", status: "collecting", assigneeName: null,
      quotes: [{ version: 1, status: "issued", supply_price: 3000000, delivery_date: null }],
    },
  ];

  test("건수·총액·대표견적 금액(최신 발행 버전)·금액 큰 순 정렬", () => {
    const r = buildUnpaidSummary(rows);
    expect(r.count).toBe(2);
    expect(r.totalAmount).toBe(4_500_000); // 1,500,000 + 3,000,000
    expect(r.items[0].company).toBe("다라상사"); // 금액 큰 순
    expect(r.items[1].amount).toBe(1_500_000); // v2 대표(v1 1,000,000 아님)
    expect(r.items[1].deliveryDate).toBe("2026-08-10");
  });

  test("발행 견적 없으면(임시만) 금액 0", () => {
    const r = buildUnpaidSummary([
      { id: "x", seq_no: "REQ-9", company: "임시사", status: "delivered", assigneeName: null,
        quotes: [{ version: 1, status: "draft", supply_price: "500000", delivery_date: null }] },
    ]);
    expect(r.totalAmount).toBe(0);
    expect(r.items[0].amount).toBe(0);
  });

  test("빈 목록 → 0/0/[]", () => {
    expect(buildUnpaidSummary([])).toEqual({ count: 0, totalAmount: 0, items: [] });
  });
});
