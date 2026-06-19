import { z } from "zod";
import { QuoteInputSchema } from "@jhtechsaas/shared";

// 견적 생성 서버액션 입력 — 슬라이스1 경계 스키마 재사용 + 장비 ≥1줄·status 제한.
// (서버 RPC가 한 번 더 재검증·재계산하므로 이건 1차 방어선.)
export const createQuotePayloadSchema = z.object({
  items: QuoteInputSchema.shape.items.min(1, "장비를 최소 한 줄 입력하세요"),
  options: QuoteInputSchema.shape.options,
  status: z.enum(["draft", "issued"]),
  // 견적서 PDF에 넣을 사양 항목 id 목록(빈배열=0개). 미지정 시 빈배열로 저장.
  specSelection: z.array(z.string()).default([]),
});

export type CreateQuotePayload = z.infer<typeof createQuotePayloadSchema>;

// 수기 견적 — 의뢰 없이 회사명부터 생성. 회사명 필수, 나머지 연락처는 선택.
export const createManualQuotePayloadSchema = createQuotePayloadSchema.extend({
  company: z.string().trim().min(1, "회사명을 입력하세요"),
  ceo: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  // 기존 고객 연결 시 그 회사 id(견적이 고객 이력에 노출되도록). 미지정=신규 수기 견적.
  companyId: z.guid().optional(),
});

export type CreateManualQuotePayload = z.infer<typeof createManualQuotePayloadSchema>;
