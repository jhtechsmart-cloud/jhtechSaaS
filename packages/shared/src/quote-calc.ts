// 견적 계산 엔진 — 순수 산술. 가격표를 내장하지 않고 입력된 숫자만 계산한다.
// 헤드 개수는 특별 취급이 아니라 "수량을 가진 옵션 한 줄"로 일반화된다(예: 프린트헤드 × 2).
import { z } from "zod";

// 견적 한 줄 = 장비든 옵션이든 동일하게 "단가 × 수량".
export type QuoteLine = {
  name: string; // 표시명
  unitPrice: number; // 정수 원, 음수 허용(할인/제외)
  quantity: number; // 정수 ≥ 1
  // 옵션 줄 구분 — 'included'(기본 공급가 포함, 단가 0) / 'extra'(추가 과금). 장비 줄은 미지정.
  // 견적에 스냅샷 저장(발행본 불변): 포함옵션이 카탈로그 변경에 흔들리지 않도록.
  kind?: "included" | "extra";
  // 장비 줄이 가리키는 카탈로그 장비 id(선택). PDF 워커가 이 id로 사양·로고·장비이미지를
  // 가져온다(의뢰 신청 장비가 아니라 견적에서 고른 장비 기준). 직접입력 줄은 미지정. 계산엔 무영향.
  equipmentId?: string;
  // 비고(선택) — 견적서 PDF '비 고' 칸에 그대로 출력. 계산엔 무영향. z.object strip 방지로 스키마에도 명시.
  remark?: string;
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
  // 옵션 줄 구분(선택). z.object는 미정의 키를 strip하므로 보존하려면 스키마에 명시해야 한다.
  kind: z.enum(["included", "extra"]).optional(),
  // 장비 id(선택) — 같은 이유로 명시해야 RPC 저장 jsonb에 보존된다(strip 방지).
  equipmentId: z.string().optional(),
  // 비고(선택) — 명시해야 jsonb에 보존된다(strip 방지). 줄당 200자 제한.
  remark: z.string().trim().max(200, "비고는 200자 이내로 입력하세요").optional(),
});

// 견적 특기사항 기본 2줄 — 폼 프리필(작성/수정) + 워커 PDF 폴백(구 견적·미저장)의 단일 출처.
export const DEFAULT_QUOTE_NOTES: readonly string[] = [
  "상기금액은 부가세(V.A.T) 별도 금액입니다.",
  "본 견적서의 유효기간은 발행일로부터 1개월입니다.",
];

// 특기사항 입력 검증 — 줄당 200자, 최대 20줄. (빈 줄 정리는 normalizeQuoteNotes로.)
export const QuoteNotesSchema = z
  .array(z.string().max(200, "특기사항은 한 줄에 200자 이내로 입력하세요"))
  .max(20, "특기사항은 최대 20줄까지 입력할 수 있습니다");

// 저장/표시용 특기사항 정규화 — 문자열만, 각 줄 trim, 빈 줄 제거. (jsonb·폼 양쪽에서 재사용.)
export function normalizeQuoteNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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
