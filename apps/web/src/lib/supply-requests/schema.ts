import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";

// lookup_company_by_biz_no RPC 응답 — P-E는 equipment_model까지 표시하므로 자체 스키마(P-D는 model 미사용).
export const lookupEquipmentSchema = z.object({
  id: z.string().uuid(),
  equipment_id: z.string().uuid().nullable(),
  equipment_name: z.string().nullable(),
  equipment_model: z.string().nullable(),
  label: z.string().nullable(),
  purchased_at: z.string().nullable(),
  install_address: z.string().nullable(),
});
export const lookupResultSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().nullable(),
  ceo: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  equipment: z.array(lookupEquipmentSchema),
});
export type LookupResult = z.infer<typeof lookupResultSchema>;
export type LookupEquipment = z.infer<typeof lookupEquipmentSchema>;

// 소모품신청(P-E) 공개 폼 — 등록고객 전용(미등록=담당자 안내). 신청자 신원(콜백 검증) + 소모품·수량.
const bizNoRegex = /^\d{10}$|^\d{3}-\d{2}-\d{5}$/;
const phoneRegex = /^(?=(?:[^0-9]*[0-9]){8,})[0-9+\-\s]{9,20}$/;

export const PRIVACY_VERSION = "v1.0";
export const QTY_MAX = 9999;

// RHF로 검증하는 필드(소모품 수량은 별도 state). biz_no·신청자·메모·동의.
export const supplyRequestFormSchema = z.object({
  biz_no: z
    .string().trim()
    .regex(bizNoRegex, "사업자등록번호 10자리를 입력하세요")
    .refine(validateBizNo, "사업자등록번호 체크섬이 일치하지 않습니다"),
  requester_name: z.string().trim().min(1, "신청자명을 입력하세요").max(100, "100자 이내로 입력하세요"),
  requester_phone: z.string().trim().regex(phoneRegex, "연락처를 확인하세요"),
  note: z.string().trim().max(2000, "2000자 이내로 입력하세요").optional().default(""),
  privacy_consent: z.literal(true, { message: "개인정보 수집·이용 동의가 필요합니다" }),
});
export type SupplyRequestFormInput = z.infer<typeof supplyRequestFormSchema>;
export type SupplyRequestFormInputRaw = z.input<typeof supplyRequestFormSchema>;

// list_consumables_for_company RPC 응답 — 외부응답 직접신뢰 금지(CLAUDE.md): Zod 검증. price 없음.
export const consumableItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string().nullable(),
});
export const consumableGroupSchema = z.object({
  equipment_id: z.string().uuid().nullable(),
  equipment_name: z.string().nullable(),
  consumables: z.array(consumableItemSchema),
});
export const listConsumablesResultSchema = z.object({
  groups: z.array(consumableGroupSchema),
  consumables: z.array(consumableItemSchema),
});
export type ConsumableItem = z.infer<typeof consumableItemSchema>;
export type ConsumableGroup = z.infer<typeof consumableGroupSchema>;
export type ListConsumablesResult = z.infer<typeof listConsumablesResultSchema>;

// last_supply_request_for_company RPC 응답 — 재주문 프리필용 {consumable_id, qty}.
export const lastSupplyResultSchema = z.object({
  items: z.array(z.object({ consumable_id: z.string().uuid(), qty: z.number().int() })),
});
export type LastSupplyResult = z.infer<typeof lastSupplyResultSchema>;

export interface SupplyRequestItemPayload {
  consumable_id: string;
  qty: number;
}
export interface SupplyRequestPayload {
  biz_no: string;
  requester_name: string;
  requester_phone: string;
  privacy_consent: true;
  privacy_consent_version: string;
  note?: string;
  items: SupplyRequestItemPayload[];
}

export function buildSupplyRequestPayload(
  input: SupplyRequestFormInput,
  items: SupplyRequestItemPayload[],
): SupplyRequestPayload {
  return {
    biz_no: input.biz_no.replace(/-/g, ""),
    requester_name: input.requester_name,
    requester_phone: input.requester_phone,
    privacy_consent: true,
    privacy_consent_version: PRIVACY_VERSION,
    ...(input.note ? { note: input.note } : {}),
    items,
  };
}

// RPC 접수번호 — SUP-YYYYMMDD-NNNNN.
export const supSeqNoSchema = z.string().regex(/^SUP-\d{8}-\d{5,}$/, "접수번호 형식 오류");
export const submitResultSchema = z.object({
  seq_no: supSeqNoSchema,
  assignee_name: z.string().nullable(),
});
