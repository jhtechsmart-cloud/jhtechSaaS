// 재고 상태 파생 — 수량>0이면 재고있음, 0이면 품절(순수 로직, 화면 배지용).
export type StockStatus = "in_stock" | "out_of_stock";

export function stockStatus(qty: number): StockStatus {
  return qty > 0 ? "in_stock" : "out_of_stock";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "재고 있음",
  out_of_stock: "품절",
};
