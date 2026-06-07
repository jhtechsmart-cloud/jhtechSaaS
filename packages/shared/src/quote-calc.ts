// 견적 계산 엔진 — 순수 산술. 가격표를 내장하지 않고 입력된 숫자만 계산한다.
// 헤드 개수는 특별 취급이 아니라 "수량을 가진 옵션 한 줄"로 일반화된다(예: 프린트헤드 × 2).
import { z } from "zod";

// 견적 한 줄 = 장비든 옵션이든 동일하게 "단가 × 수량".
export type QuoteLine = {
  name: string; // 표시명
  unitPrice: number; // 정수 원, 음수 허용(할인/제외)
  quantity: number; // 정수 ≥ 1
};

export type QuoteInput = {
  items: QuoteLine[]; // 기본장비 N대
  options: QuoteLine[]; // 추가옵션·직접입력·할인
  taxRate?: number; // 기본 0.1 (10%)
};

export type QuoteResult = {
  supplyPrice: number; // 공급가 = 모든 줄 합
  taxPrice: number; // 세액 = round(공급가 × taxRate)
  total: number; // 합계 = 공급가 + 세액
};

// 경계 검증용 Zod 스키마. calculateQuote 자체는 검증된 입력을 가정하므로,
// 서버 액션·RPC 등 외부 경계에서 이 스키마로 먼저 거른다(CLAUDE.md 외부 입력 Zod 검증).
// unitPrice·quantity 모두 .int() → 소수·NaN·Infinity는 Number.isInteger가 false라 거부된다.
const QuoteLineSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요"),
  unitPrice: z.number().int("단가는 정수 원만 가능합니다"), // 음수 허용(할인/제외)
  quantity: z.number().int("수량은 정수만 가능합니다").min(1, "수량은 1 이상이어야 합니다"),
});

export const QuoteInputSchema = z.object({
  items: z.array(QuoteLineSchema),
  options: z.array(QuoteLineSchema),
  taxRate: z.number().min(0, "세율은 0 이상").max(1, "세율은 1 이하").optional(),
});

export function calculateQuote(input: QuoteInput): QuoteResult {
  const taxRate = input.taxRate ?? 0.1;
  const sumLines = (lines: QuoteLine[]) =>
    lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);

  const supplyPrice = sumLines(input.items) + sumLines(input.options);
  const taxPrice = Math.round(supplyPrice * taxRate);
  const total = supplyPrice + taxPrice;

  return { supplyPrice, taxPrice, total };
}
