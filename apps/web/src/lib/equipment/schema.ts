import { z } from "zod";

// 장비 폼 스키마 — 클라이언트(react-hook-form) 검증과 서버 액션 검증이 공유.
// 스칼라 필드만(P2). 사양·옵션·이미지는 P3에서 별도 처리.
export const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "장비명을 입력하세요"),
  model: z.string().trim().default(""),
  category: z.string().trim().default(""),
  base_price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
  status: z.enum(["active", "inactive"]),
  // 선택값: 빈 문자열 허용, 값이 있으면 URL 형식.
  youtube_url: z
    .union([z.literal(""), z.string().url("유효한 YouTube 링크가 아닙니다")])
    .default(""),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
