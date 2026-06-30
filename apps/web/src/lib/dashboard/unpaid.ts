import type { ApplicationStatus } from "@/lib/customers/history";

// 미수금 위젯 순수 집계 — 납품완료·수금중 의뢰의 대표 발행견적 금액(공급가)으로 건수·총액·목록 파생.
// 대표 견적 = 발행(issued) 중 최신 버전. 금액은 화면 합계 규칙대로 supply_price(공급가, VAT 별도).

export interface UnpaidQuoteLite {
  version: number;
  status: string; // 'draft' | 'issued'
  supply_price: number | string;
}

export interface UnpaidAppRow {
  id: string;
  seq_no: string;
  company: string;
  status: ApplicationStatus; // 'delivered' | 'collecting'
  assigneeName: string | null;
  // 납품일 = 발행 출고의뢰서의 의뢰별 최신 설치일시(KST 'YYYY-MM-DD', 없으면 null).
  deliveryDate: string | null;
  quotes: UnpaidQuoteLite[];
}

export interface UnpaidItem {
  id: string;
  seq_no: string;
  company: string;
  status: ApplicationStatus;
  assigneeName: string | null;
  amount: number; // 대표 발행견적 공급가(없으면 0)
  deliveryDate: string | null;
}

export interface UnpaidSummary {
  count: number;
  totalAmount: number;
  items: UnpaidItem[]; // 금액 큰 순
}

export function buildUnpaidSummary(rows: ReadonlyArray<UnpaidAppRow>): UnpaidSummary {
  const items: UnpaidItem[] = rows.map((r) => {
    // 발행 견적 중 최신 버전 = 대표. 미발행만 있으면 금액 0.
    const rep = r.quotes
      .filter((q) => q.status === "issued")
      .sort((a, b) => b.version - a.version)[0];
    return {
      id: r.id,
      seq_no: r.seq_no,
      company: r.company,
      status: r.status,
      assigneeName: r.assigneeName,
      amount: rep ? Number(rep.supply_price) : 0,
      deliveryDate: r.deliveryDate,
    };
  });
  items.sort((a, b) => b.amount - a.amount);
  return {
    count: items.length,
    totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
    items,
  };
}
