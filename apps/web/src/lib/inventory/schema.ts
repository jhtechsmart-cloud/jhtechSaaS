import { z } from "zod";

// 재고 수정 입력 — 서버 액션 1차 방어선(RLS가 권한 최종 강제).
// 수량 0 이상 정수, 입고예정일 YYYY-MM-DD 또는 null, 메모 ≤500자 또는 null.
// 판매확정(sold_confirmed)은 여기 없음 — 읽기전용, confirm/cancel RPC로만 변경.
export const inventoryInputSchema = z.object({
  stockQty: z.number().int("정수만 입력하세요").min(0, "0 이상 입력하세요"),
  demoQty: z.number().int("정수만 입력하세요").min(0, "0 이상 입력하세요"), // 데모장비(대수, 수기)
  usedQty: z.number().int("정수만 입력하세요").min(0, "0 이상 입력하세요"), // 중고장비(대수, 수기)
  restockDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식(YYYY-MM-DD)을 확인하세요")
    .nullable(),
  note: z.string().max(500, "메모는 500자 이내").nullable(),
});

export type InventoryInput = z.infer<typeof inventoryInputSchema>;
