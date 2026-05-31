import { z } from "zod";

// 견적요청 폼 — 클라이언트(react-hook-form) 검증과 서버액션 재검증이 공유.
// 코어 6필드 모두 필수(brainstorm 합의), requirements·equipment_id는 선택.
const bizNoRegex = /^\d{10}$|^\d{3}-\d{2}-\d{5}$/; // 10자리 연속 또는 XXX-XX-XXXXX
const phoneRegex = /^(?=.*\d)[0-9+\-\s]{9,20}$/; // 숫자·하이픈·공백·+, 최소 1개 숫자 필수

export const requestFormSchema = z.object({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  ceo: z.string().trim().min(1, "대표자명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  biz_no: z.string().trim().regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요"),
  phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  // zod4: .email()은 deprecated지만 동작. 린트가 막으면 z.email("...")로 교체.
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다").max(200, "200자 이내로 입력하세요"),
  address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내로 입력하세요"),
  requirements: z.string().trim().max(2000, "2000자 이내로 입력하세요").optional().default(""),
  // hidden input은 장비 미선택 시 ""를 보내므로 ""→undefined 전처리(빈 문자열이 uuid 검증에 걸리지 않게).
  equipment_id: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().uuid().optional(),
  ),
});

export type RequestFormInput = z.infer<typeof requestFormSchema>;

// RHF useForm 입력 타입(검증 전). zodResolver가 출력 타입(RequestFormInput)으로 변환해 전달.
export type RequestFormInputRaw = z.input<typeof requestFormSchema>;

export interface SubmitPayload {
  company: string;
  ceo: string;
  biz_no: string;
  phone: string;
  email: string;
  address: string;
  fields: {
    requirements?: string;
    equipment_id?: string;
    equipment_name?: string;
  };
}

// 폼 입력 → RPC payload. equipment_name은 서버액션이 equipment_public에서 조회해 합친다.
export function buildSubmitPayload(
  input: RequestFormInput,
  equipmentName?: string,
): SubmitPayload {
  const fields: SubmitPayload["fields"] = {};
  if (input.requirements) fields.requirements = input.requirements;
  if (input.equipment_id) fields.equipment_id = input.equipment_id;
  if (equipmentName) fields.equipment_name = equipmentName;
  return {
    company: input.company,
    ceo: input.ceo,
    biz_no: input.biz_no.replace(/-/g, ""), // 정규화: 하이픈 제거 → 10자리
    phone: input.phone,
    email: input.email,
    address: input.address,
    fields,
  };
}

// RPC 접수번호 응답 검증 — 외부응답 직접 신뢰 금지(CLAUDE.md).
export const seqNoSchema = z.string().regex(/^REQ-\d{8}-\d{5,}$/, "접수번호 형식 오류");
