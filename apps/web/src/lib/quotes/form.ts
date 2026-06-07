// 견적 작성 폼 순수 로직 — 행 정리·RPC 입력 변환·실시간 합계·검증.
// 합계는 슬라이스1 calculateQuote를 그대로 쓴다(화면 미리보기). 저장 권위는 서버 RPC.
import { calculateQuote, type QuoteInput, type QuoteResult } from "@jhtechsaas/shared";

// 폼 한 줄. 입력 중에는 단가·수량이 비거나 NaN일 수 있다.
export type QuoteRow = { name: string; unitPrice: number; quantity: number };

// 미완성(빈) 행 = 이름이 비어있고 단가도 0/빈. 저장·검증에서 제외한다.
function isEmptyRow(r: QuoteRow): boolean {
  return r.name.trim() === "" && (!Number.isFinite(r.unitPrice) || r.unitPrice === 0);
}

export function cleanRows(rows: QuoteRow[]): QuoteRow[] {
  return rows.filter((r) => !isEmptyRow(r));
}

// 폼 행 → RPC 입력(정리된 행만). 서버는 items·options만 받아 금액을 재계산한다.
export function rowsToQuoteInput(items: QuoteRow[], options: QuoteRow[]): QuoteInput {
  return { items: cleanRows(items), options: cleanRows(options) };
}

// 실시간 합계 — 입력 중 NaN/빈 값은 0으로 취급해 미리보기가 깨지지 않게 한다.
function coerce(r: QuoteRow): QuoteRow {
  return {
    name: r.name,
    unitPrice: Number.isFinite(r.unitPrice) ? r.unitPrice : 0,
    quantity: Number.isFinite(r.quantity) ? r.quantity : 0,
  };
}

export function previewTotals(items: QuoteRow[], options: QuoteRow[]): QuoteResult {
  return calculateQuote({ items: items.map(coerce), options: options.map(coerce) });
}

// 저장된 견적 줄(jsonb) → 폼 행. 재발행 프리필용. 깨진 값은 안전 기본으로 코어스(방어).
export function parseQuoteLines(value: unknown): QuoteRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    return {
      name: typeof o.name === "string" ? o.name : "",
      unitPrice: typeof o.unitPrice === "number" && Number.isFinite(o.unitPrice) ? o.unitPrice : 0,
      quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : 0,
    };
  });
}

// 저장 전 검증 — 에러 메시지(한국어) 또는 null. 정리된 행 기준.
export function validateQuoteForm(items: QuoteRow[], options: QuoteRow[]): string | null {
  const cleanItems = cleanRows(items);
  if (cleanItems.length === 0) {
    return "장비를 최소 한 줄 입력하세요.";
  }
  for (const r of [...cleanItems, ...cleanRows(options)]) {
    if (r.name.trim() === "") {
      return "이름을 입력하세요.";
    }
    if (!Number.isInteger(r.unitPrice)) {
      return "단가는 정수(원)여야 합니다.";
    }
    if (!Number.isInteger(r.quantity) || r.quantity < 1) {
      return "수량은 1 이상 정수여야 합니다.";
    }
  }
  return null;
}
