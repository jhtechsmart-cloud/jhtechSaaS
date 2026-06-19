import { describe, expect, test } from "vitest";
import { stockStatus, STOCK_STATUS_LABEL } from "./status";

describe("stockStatus", () => {
  test("수량 0 → 품절", () => {
    expect(stockStatus(0)).toBe("out_of_stock");
    expect(STOCK_STATUS_LABEL[stockStatus(0)]).toBe("품절");
  });
  test("수량 1 이상 → 재고 있음", () => {
    expect(stockStatus(1)).toBe("in_stock");
    expect(stockStatus(99)).toBe("in_stock");
    expect(STOCK_STATUS_LABEL[stockStatus(5)]).toBe("재고 있음");
  });
});
