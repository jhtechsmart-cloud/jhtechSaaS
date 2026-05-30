import { z } from "zod";

// 사양 행 — 빈 값 허용(편집 중 빈 행). 직렬화 시 제거(serializeSpecs).
export const specEntrySchema = z.object({
  label: z.string(),
  value: z.string(),
});

// 옵션 행 — name 빈값 허용(직렬화에서 제거). kind=included/extra, price≥0.
export const optionEntrySchema = z.object({
  kind: z.enum(["included", "extra"]),
  name: z.string(),
  price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
});

// 장비 폼 스키마 — 클라이언트(react-hook-form) 검증과 서버 액션 검증이 공유.
export const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "장비명을 입력하세요"),
  model: z.string().trim().default(""),
  category: z.string().trim().default(""),
  base_price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
  status: z.enum(["active", "inactive"]),
  youtube_url: z
    .union([z.literal(""), z.string().url("유효한 YouTube 링크가 아닙니다")])
    .default(""),
  // P3 동적 필드
  specs: z.array(specEntrySchema).default([]),
  photos: z.array(z.string()).default([]), // Storage 객체 경로
  options: z.array(optionEntrySchema).default([]),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
export type SpecDraft = z.infer<typeof specEntrySchema>;
export type OptionDraft = z.infer<typeof optionEntrySchema>;
