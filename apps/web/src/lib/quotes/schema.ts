import { z } from "zod";
import { QuoteInputSchema } from "@jhtechsaas/shared";

// 견적 생성 서버액션 입력 — 슬라이스1 경계 스키마 재사용 + 장비 ≥1줄·status 제한.
// (서버 RPC가 한 번 더 재검증·재계산하므로 이건 1차 방어선.)
export const createQuotePayloadSchema = z.object({
  items: QuoteInputSchema.shape.items.min(1, "장비를 최소 한 줄 입력하세요"),
  options: QuoteInputSchema.shape.options,
  status: z.enum(["draft", "issued"]),
});

export type CreateQuotePayload = z.infer<typeof createQuotePayloadSchema>;
