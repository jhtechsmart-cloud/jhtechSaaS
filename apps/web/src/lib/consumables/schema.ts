import { z } from "zod";

// 소모품 매핑 행 — 분류(category) 또는 특정 장비(equipment_id) 중 하나만(XOR).
export const consumableScopeRowSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")), // 기존 uuid 또는 "" (신규)
    category: z.string().trim().max(100, "100자 이내"),
    equipment_id: z.string().uuid().or(z.literal("")),
  })
  .refine(
    (r) => (r.category !== "") !== (r.equipment_id !== ""),
    "분류 또는 특정 장비 중 하나만 지정하세요",
  );

// 가격 — 빈 값 허용(선택). 값이 있으면 0 이상 숫자.
const priceOptional = z
  .string()
  .trim()
  .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "0 이상 숫자만 입력하세요");

// 소모품 폼 — 클라이언트(react-hook-form)와 서버액션 재검증이 공유.
export const consumableFormSchema = z.object({
  name: z.string().trim().min(1, "소모품명을 입력하세요").max(200, "200자 이내"),
  unit: z.string().trim().max(50, "50자 이내").default(""),
  sku: z.string().trim().max(100, "100자 이내").default(""),
  price: priceOptional.default(""),
  note: z.string().trim().max(2000, "2000자 이내").default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  scopes: z.array(consumableScopeRowSchema).default([]),
});

export type ConsumableFormValues = z.infer<typeof consumableFormSchema>;
export type ConsumableScopeRow = z.infer<typeof consumableScopeRowSchema>;
