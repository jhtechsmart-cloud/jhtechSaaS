import { z } from "zod";
import { SPEC_ICONS } from "@jhtechsaas/shared";

// 사양 항목 — 빈 값 허용(편집 중 빈 행). 직렬화 시 제거(serializeSpecs).
export const specItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// 사양 그룹 — 그룹명 + 아이콘(고정 enum) + 항목 배열.
export const specGroupSchema = z.object({
  group: z.string(),
  icon: z.enum(SPEC_ICONS),
  items: z.array(specItemSchema),
});

// 옵션 행 — name 빈값 허용(직렬화에서 제거). kind=included/extra, price≥0.
export const optionEntrySchema = z.object({
  kind: z.enum(["included", "extra"]),
  name: z.string(),
  price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
});

// YouTube URL 한 개 — 빈 문자열 또는 YouTube 호스트로 제한(stored-XSS 방지).
const youtubeUrl = z.union([
  z.literal(""),
  z
    .string()
    .regex(
      /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//,
      "유효한 YouTube 링크가 아닙니다",
    ),
]);

// 장비 폼 스키마 — 클라이언트(react-hook-form) 검증과 서버 액션 검증이 공유.
export const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "장비명을 입력하세요"),
  model: z.string().trim().default(""),
  category_id: z.guid().or(z.literal("")).default(""),
  base_price: z
    .number({ message: "올바른 금액을 입력하세요" })
    .min(0, "올바른 금액을 입력하세요"),
  status: z.enum(["active", "inactive"]),
  // 요약 불릿(P-A)
  highlights: z.array(z.string()).default([]),
  // 복수 제품 영상(P-A) — 각 항목 YouTube 호스트 제한
  youtube_urls: z.array(youtubeUrl).default([]),
  // 그룹 사양(P-A)
  specs: z.array(specGroupSchema).default([]),
  // Storage 객체 경로. 형식 강제(경로조작 방지): equipment/{uuid}/{uuid}.{ext}.
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
  // 견적서 장비 자산(좌하단 네임·우하단 이미지) Storage 객체 경로. 빈 문자열 허용(미설정).
  // 형식 강제(경로조작 방지·DB CHECK와 일치): equipment/{uuid}/device-(name|image).{ext}.
  quote_device_name: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^equipment\/[0-9a-f-]{36}\/device-name\.(jpg|jpeg|png|webp)$/i,
          "잘못된 장비 네임 경로",
        ),
    ])
    .default(""),
  quote_device_image: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(
          /^equipment\/[0-9a-f-]{36}\/device-image\.(jpg|jpeg|png|webp)$/i,
          "잘못된 장비 이미지 경로",
        ),
    ])
    .default(""),
});

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;
export type SpecGroupDraft = z.infer<typeof specGroupSchema>;
export type SpecItemDraft = z.infer<typeof specItemSchema>;
export type OptionDraft = z.infer<typeof optionEntrySchema>;
