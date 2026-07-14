import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

// A/S신청(P-D) 공개 폼 — 클라(react-hook-form) 검증과 서버 RPC 재검증이 공유.
// 신원모델 A: 사업자번호 조회 → 자동완성(등록) 또는 직접입력(미등록). 검증은 담당자 콜백.
const bizNoRegex = /^\d{10}$|^\d{3}-\d{2}-\d{5}$/;
const phoneRegex = /^(?=(?:[^0-9]*[0-9]){8,})[0-9+\-\s]{9,20}$/;

export const serviceRequestFormSchema = z.object({
  biz_no: z
    .string().trim()
    .regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요")
    .refine(validateBizNo, "사업자등록번호 체크섬이 일치하지 않습니다"),
  contact_company: z.string().trim().min(1, "회사명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  contact_ceo: z.string().trim().max(200, "200자 이내로 입력하세요").optional().default(""),
  contact_phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  contact_email: z
    .string().trim().max(200, "200자 이내로 입력하세요")
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "이메일 형식이 올바르지 않습니다")
    .optional().default(""),
  contact_address: z.string().trim().max(500, "500자 이내로 입력하세요").optional().default(""),
  // 등록고객이 보유장비를 고른 경우만. 미등록/미선택은 "" → undefined.
  company_equipment_id: z.preprocess((v) => (v === "" ? undefined : v), z.guid().optional()),
  symptom: z.string().trim().min(1, "고장 증상을 입력하세요").max(2000, "2000자 이내로 입력하세요"),
  preferred_date: z.string().trim().optional().default(""),
  privacy_consent: z.literal(true, { message: "개인정보 수집·이용 동의가 필요합니다" }),
});

export type ServiceRequestFormInput = z.infer<typeof serviceRequestFormSchema>;
export type ServiceRequestFormInputRaw = z.input<typeof serviceRequestFormSchema>;

// A/S 사진 슬롯 — 증상사진 최대 3장. DB·RPC·버킷 정규식과 동일집합.
export const AS_PHOTO_SLOTS = ["as_photo_1", "as_photo_2", "as_photo_3"] as const;
export type AsPhotoSlot = (typeof AS_PHOTO_SLOTS)[number];

export const PRIVACY_VERSION = "v1.1";

// lookup_company_by_biz_no RPC 응답 — 외부응답 직접신뢰 금지(CLAUDE.md): Zod 검증.
export const lookupEquipmentSchema = z.object({
  id: z.guid(),
  equipment_id: z.guid().nullable(),
  equipment_name: z.string().nullable(),
  label: z.string().nullable(),
  purchased_at: z.string().nullable(),
  install_address: z.string().nullable(),
});
export const lookupResultSchema = z.object({
  company_id: z.guid(),
  name: z.string().nullable(),
  ceo: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  equipment: z.array(lookupEquipmentSchema),
});
export type LookupResult = z.infer<typeof lookupResultSchema>;
export type LookupEquipment = z.infer<typeof lookupEquipmentSchema>;

export interface ServiceRequestPayload {
  biz_no: string;
  contact_company: string;
  contact_ceo?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_address?: string;
  company_equipment_id?: string;
  privacy_consent: true;
  privacy_consent_version: string;
  fields: {
    symptom: string;
    preferred_date?: string;
    photos: Partial<Record<AsPhotoSlot, string>>;
  };
}

export function buildServiceRequestPayload(
  input: ServiceRequestFormInput,
  photos: Partial<Record<AsPhotoSlot, string>>,
): ServiceRequestPayload {
  const fields: ServiceRequestPayload["fields"] = { symptom: input.symptom, photos };
  if (input.preferred_date) fields.preferred_date = input.preferred_date;
  return {
    biz_no: input.biz_no.replace(/-/g, ""),
    contact_company: input.contact_company,
    ...(input.contact_ceo ? { contact_ceo: input.contact_ceo } : {}),
    ...(input.contact_phone ? { contact_phone: input.contact_phone } : {}),
    ...(input.contact_email ? { contact_email: input.contact_email } : {}),
    ...(input.contact_address ? { contact_address: input.contact_address } : {}),
    ...(input.company_equipment_id ? { company_equipment_id: input.company_equipment_id } : {}),
    privacy_consent: true,
    privacy_consent_version: PRIVACY_VERSION,
    fields,
  };
}

// RPC 접수번호 응답 검증 — AS-YYYYMMDD-NNNNN.
export const asSeqNoSchema = z.string().regex(/^AS-\d{8}-\d{5,}$/, "접수번호 형식 오류");

// submit RPC 반환(jsonb): { seq_no, assignee_name }.
export const submitResultSchema = z.object({
  seq_no: asSeqNoSchema,
  assignee_name: z.string().nullable(),
});
