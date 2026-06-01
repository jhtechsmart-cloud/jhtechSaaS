import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

// 사업자등록번호 — 빈 값 허용(선택 항목). 값이 있으면 체크섬 검증.
const bizNoOptional = z
  .string().trim()
  .refine((v) => v === "" || validateBizNo(v), "사업자등록번호 체크섬이 일치하지 않습니다");

// 보유장비 행 — 카탈로그 장비(equipment_id) 또는 직접입력(label) 중 하나만(XOR).
export const companyEquipmentRowSchema = z
  .object({
    id: z.string().uuid().or(z.literal("")), // 기존 uuid 또는 "" (신규). malformed id 차단.
    equipment_id: z.string().uuid().or(z.literal("")),
    label: z.string().trim().max(200, "200자 이내"),
    serial_no: z.string().trim().max(100, "100자 이내"),
    purchased_at: z.string(),
    install_address: z.string().trim().max(500, "500자 이내"),
  })
  .refine(
    (r) => (r.equipment_id !== "") !== (r.label !== ""),
    "카탈로그 장비 또는 직접입력 장비명 중 하나만 지정하세요",
  );

// 고객(업체) 폼 스키마 — 클라이언트(react-hook-form)와 서버액션 재검증이 공유.
// 필수: name. 나머지는 선택(운영자가 순차적으로 보완 가능).
export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "업체명을 입력하세요").max(200, "200자 이내"),
  biz_no: bizNoOptional,
  ceo: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(500, "500자 이내").default(""),
  note: z.string().trim().max(2000).default(""),
  assignee_id: z.string().default(""),
  equipment: z.array(companyEquipmentRowSchema).default([]),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type CompanyEquipmentRow = z.infer<typeof companyEquipmentRowSchema>;
