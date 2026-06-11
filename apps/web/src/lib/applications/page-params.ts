import { z } from "zod";

// 목록 페이지 파라미터 — 서버 액션은 직접 POST로도 도달 가능하므로
// 음수 offset·거대 limit·임의 scope를 서버에서 거부한다(클라 UI 가드의 서버 짝).
export const PAGE_LIMIT_MAX = 100;

export const pageParamsSchema = z.object({
  scope: z.enum(["active", "closed", "all"]),
  q: z.string().trim().max(200).optional(),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(PAGE_LIMIT_MAX),
});

export type PageParams = z.infer<typeof pageParamsSchema>;
