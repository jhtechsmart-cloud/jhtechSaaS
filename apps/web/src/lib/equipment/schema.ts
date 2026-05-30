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
  // 선택값. .url()은 javascript:/data: 등 임의 스킴을 통과시키므로 YouTube 호스트로 제한
  // (E3 공개 페이지에서 링크로 렌더 시 stored-XSS 방지).
  youtube_url: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//,
          "유효한 YouTube 링크가 아닙니다",
        ),
    ])
    .default(""),
  // P3 동적 필드
  specs: z.array(specEntrySchema).default([]),
  // Storage 객체 경로. 형식 강제(타 장비 경로·경로조작으로 임의 객체 삭제 방지):
  // equipment/{uuid}/{uuid}.{ext}. 업로더가 항상 이 형식으로 생성한다.
  photos: z
    .array(
      z
        .string()
        .regex(
          /^equipment\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i,
          "잘못된 이미지 경로",
        ),
    )
    .default([]),
  options: z.array(optionEntrySchema).default([]),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
export type SpecDraft = z.infer<typeof specEntrySchema>;
export type OptionDraft = z.infer<typeof optionEntrySchema>;
