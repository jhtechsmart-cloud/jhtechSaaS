import { z } from "zod";
import { PRIVACY_VERSION, type AsPhotoSlot } from "./schema";
import { STAFF_CHANNELS } from "./channel";

// A/S 대행 접수(직원 전용, #281) — 콘솔 폼 클라 검증. 서버 RPC(create_service_request_by_staff)가 재검증·값 강제.
// 고객 정보(회사명·대표·연락처·주소·사업자번호)는 폼이 보내지 않는다 — RPC가 companies 행에서 스냅샷.
const phoneRegex = /^(?=(?:[^0-9]*[0-9]){8,})[0-9+\-\s]{9,20}$/;

export const staffServiceRequestFormSchema = z.object({
  company_id: z.guid({ message: "고객을 선택하세요" }),
  // 보유장비 미선택("")은 undefined.
  company_equipment_id: z.preprocess((v) => (v === "" ? undefined : v), z.guid().optional()),
  contact_name: z.string().trim().max(60, "60자 이내로 입력하세요").optional().default(""),
  callback_phone: z
    .string()
    .trim()
    .refine((v) => v === "" || phoneRegex.test(v), "회신 번호를 확인하세요")
    .optional()
    .default(""),
  symptom: z.string().trim().min(1, "증상을 입력하세요").max(2000, "2000자 이내로 입력하세요"),
  preferred_date: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "희망일은 YYYY-MM-DD 형식")
    .optional()
    .default(""),
  channel: z.enum(STAFF_CHANNELS, { message: "접수 경로를 선택하세요" }),
  privacy_consent: z.literal(true, { message: "고객에게 개인정보 동의를 안내·확인했는지 체크하세요" }),
});

export type StaffServiceRequestFormInput = z.infer<typeof staffServiceRequestFormSchema>;
export type StaffServiceRequestFormInputRaw = z.input<typeof staffServiceRequestFormSchema>;

export interface StaffServiceRequestPayload {
  company_id: string;
  company_equipment_id?: string;
  channel: (typeof STAFF_CHANNELS)[number];
  privacy_consent: true;
  privacy_consent_version: string;
  submission_id: string; // 멱등 키 = 사진 경로 prefix uuid
  fields: {
    symptom: string;
    contact_name?: string;
    callback_phone?: string;
    preferred_date?: string;
    photos: Partial<Record<AsPhotoSlot, string>>;
  };
}

// 폼 값 → RPC payload. 빈 선택 항목은 키 자체를 뺀다(서버 화이트리스트와 동형).
export function buildStaffServiceRequestPayload(
  input: StaffServiceRequestFormInput,
  submissionId: string,
  photos: Partial<Record<AsPhotoSlot, string>>,
): StaffServiceRequestPayload {
  const fields: StaffServiceRequestPayload["fields"] = { symptom: input.symptom, photos };
  if (input.contact_name) fields.contact_name = input.contact_name;
  if (input.callback_phone) fields.callback_phone = input.callback_phone;
  if (input.preferred_date) fields.preferred_date = input.preferred_date;
  return {
    company_id: input.company_id,
    company_equipment_id: input.company_equipment_id,
    channel: input.channel,
    privacy_consent: true,
    privacy_consent_version: PRIVACY_VERSION,
    submission_id: submissionId,
    fields,
  };
}

// RPC 응답 — 외부 응답 직접 신뢰 금지(Zod).
export const staffSubmitResultSchema = z.object({
  id: z.guid(),
  seq_no: z.string().min(1),
  duplicate: z.boolean().optional(),
});
