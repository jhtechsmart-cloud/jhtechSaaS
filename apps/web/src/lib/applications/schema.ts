import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

// 견적요청 폼 — 클라이언트(react-hook-form) 검증과 서버액션 재검증이 공유.
// 코어 6필드 모두 필수(brainstorm 합의), requirements·equipment_id는 선택.
const bizNoRegex = /^\d{10}$|^\d{3}-\d{2}-\d{5}$/; // 10자리 연속 또는 XXX-XX-XXXXX
const phoneRegex = /^(?=(?:[^0-9]*[0-9]){8,})[0-9+\-\s]{9,20}$/; // 숫자·하이픈·공백·+, 숫자 최소 8자리

// 설치설문 enum — 서버는 jsonb 자유저장, 클라에서 UX·일관성 위해 enum 강제.
export const BUILDING_TYPES = ["factory", "store", "office", "etc"] as const;
export const LOCATIONS = ["basement", "ground", "upper"] as const;
export const ELEVATORS = ["have", "none"] as const;
export const HANDLING_OPTS = ["no_vehicle", "manual", "ladder"] as const;
export const POWERS = ["single_220", "triple_380"] as const;
export const PNEUMATICS = ["have", "none"] as const;

export const requestFormSchema = z.object({
  company: z.string().trim().min(1, "회사명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  ceo: z.string().trim().min(1, "대표자명을 입력하세요").max(200, "200자 이내로 입력하세요"),
  biz_no: z
    .string().trim()
    .regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요")
    .refine(validateBizNo, "사업자등록번호 체크섬이 일치하지 않습니다"),
  phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  // zod4: .email()은 deprecated지만 동작. 린트가 막으면 z.email("...")로 교체.
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다").max(200, "200자 이내로 입력하세요"),
  address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내로 입력하세요"),
  requirements: z.string().trim().max(2000, "2000자 이내로 입력하세요").optional().default(""),
  // 개인정보 수집·이용 동의 — 반드시 true여야 제출 가능(literal(true)로 강제).
  privacy_consent: z.literal(true, { message: "개인정보 수집·이용 동의가 필요합니다" }),
  // 설치설문 필드 — 고객이 현장 환경을 미리 기재해 현장 방문 횟수 절감.
  building_type: z.enum(BUILDING_TYPES),
  location: z.enum(LOCATIONS),
  elevator: z.enum(ELEVATORS),
  handling: z.array(z.enum(HANDLING_OPTS)).default([]),
  power: z.enum(POWERS),
  pneumatic: z.enum(PNEUMATICS),
  survey_extra: z.string().trim().max(1000, "1000자 이내로 입력하세요").optional().default(""),
  // hidden input은 장비 미선택 시 ""를 보내므로 ""→undefined 전처리(빈 문자열이 uuid 검증에 걸리지 않게).
  equipment_id: z.preprocess((v) => (v === "" ? undefined : v), z.guid().optional()),
});

export type RequestFormInput = z.infer<typeof requestFormSchema>;

// RHF useForm 입력 타입(검증 전). zodResolver가 출력 타입(RequestFormInput)으로 변환해 전달.
export type RequestFormInputRaw = z.input<typeof requestFormSchema>;

// 사진 슬롯 — 외부(진입로·건물외관)·내부(입구·설치위치) 4장.
export const PHOTO_SLOTS = ["ext_entrance", "ext_building", "int_entrance", "int_location"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

// 개인정보 동의 버전 — 약관 개정 시 숫자만 올린다.
export const PRIVACY_VERSION = "v1.1";

export interface SubmitPayload {
  company: string;
  ceo: string;
  biz_no: string;
  phone: string;
  email: string;
  address: string;
  equipment_id?: string;
  privacy_consent: true;
  privacy_consent_version: string;
  fields: {
    requirements?: string;
    equipment_id?: string;
    equipment_name?: string;
    install_survey: {
      building_type: string;
      location: string;
      elevator: string;
      handling: string[];
      power: string;
      pneumatic: string;
      extra?: string;
    };
    photos: Partial<Record<PhotoSlot, string>>;
  };
}

// 폼 입력 + 업로드된 사진 경로 → RPC payload.
// photos: { [PhotoSlot]: "storage-path" } — 업로더가 완료한 슬롯만 포함.
export function buildSubmitPayload(
  input: RequestFormInput,
  equipmentName: string | undefined,
  photos: Partial<Record<PhotoSlot, string>>,
): SubmitPayload {
  const fields: SubmitPayload["fields"] = {
    install_survey: {
      building_type: input.building_type,
      location: input.location,
      elevator: input.elevator,
      handling: input.handling,
      power: input.power,
      pneumatic: input.pneumatic,
      ...(input.survey_extra ? { extra: input.survey_extra } : {}),
    },
    photos,
  };
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
    ...(input.equipment_id ? { equipment_id: input.equipment_id } : {}),
    privacy_consent: true,
    privacy_consent_version: PRIVACY_VERSION,
    fields,
  };
}

// RPC 접수번호 응답 검증 — 외부응답 직접 신뢰 금지(CLAUDE.md).
export const seqNoSchema = z.string().regex(/^REQ-\d{8}-\d{5,}$/, "접수번호 형식 오류");

// 설치설문 한글 라벨맵 — 공개폼 InstallSurvey.tsx 문구와 동일. admin 상세 렌더의 단일출처.
export const SURVEY_LABELS = {
  building_type: { factory: "공장", store: "상가", office: "사무실", etc: "기타" },
  location: { basement: "지하", ground: "1층", upper: "2층 이상" },
  elevator: { have: "있음", none: "없음" },
  handling: { no_vehicle: "차량 진입 곤란", manual: "수작업 운반", ladder: "사다리차 필요" },
  power: { single_220: "단상 220V", triple_380: "3상 380V" },
  pneumatic: { have: "있음", none: "없음" },
} as const;

// 설문 항목 표시 라벨(섹션 좌측 라벨).
export const SURVEY_FIELD_LABELS: Record<string, string> = {
  building_type: "건물 유형",
  location: "설치 위치",
  elevator: "엘리베이터",
  power: "전력",
  pneumatic: "공압",
  handling: "기타사항",
};
