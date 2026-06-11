import { z } from "zod";

// 고객 목록 페이지 파라미터 — 서버 액션은 직접 POST로도 도달 가능하므로 서버에서 검증.
export const COMPANY_PAGE_LIMIT_MAX = 100;

export const companyPageParamsSchema = z.object({
  scope: z.enum(["all", "mine", "unassigned"]),
  sort: z.enum(["name", "recent"]),
  q: z.string().trim().max(200).optional(),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(COMPANY_PAGE_LIMIT_MAX),
});

export type CompanyPageParams = z.infer<typeof companyPageParamsSchema>;
