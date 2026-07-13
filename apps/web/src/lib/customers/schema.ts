import { z } from "zod";
import { validateBizNo } from "@jhtechsaas/shared";
import { hasAnyContact, isOptionalEmailValid } from "./validation";

// 보유장비 행 — 카탈로그 장비(equipment_id) 또는 직접입력(label) 중 하나만(XOR).
export const companyEquipmentRowSchema = z
  .object({
    id: z.guid().or(z.literal("")), // 기존 uuid 또는 "" (신규). malformed id 차단.
    equipment_id: z.guid().or(z.literal("")),
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
// 필수: name·biz_no(단 '사업자번호 없음' 체크 시 면제)·ceo·address·연락처(최소1).
export const companyFormSchema = z
  .object({
    name: z.string().trim().min(1, "업체명을 입력하세요").max(200, "200자 이내"),
    biz_no: z.string().trim().max(20),
    biz_no_none: z.boolean().default(false), // 폼 전용 — DB 미저장(사업자번호 없는 고객 예외)
    ceo: z.string().trim().min(1, "대표자를 입력하세요").max(200),
    // 담당자(고객 측)·업태 — 기본 정보(견적 신청기업 정보와 1:1).
    manager: z.string().trim().max(200, "200자 이내").default(""),
    // 담당자 직책 — 견적서 PDF "[회사][담당자][직책] 귀하"에 사용.
    manager_title: z.string().trim().max(100, "100자 이내").default(""),
    phone: z.string().trim().max(50).default(""),
    email: z.string().trim().max(200).default(""),
    address: z.string().trim().min(1, "주소를 입력하세요").max(500, "500자 이내"),
    biz_type: z.string().trim().max(200, "200자 이내").default(""),
    biz_item: z.string().trim().max(200, "200자 이내").default(""),
    // 추가 정보(거래처 장부) — 장부명·전화1/2·팩스·실제주소1/2.
    ledger_name: z.string().trim().max(200, "200자 이내").default(""),
    phone1: z.string().trim().max(50, "50자 이내").default(""),
    phone2: z.string().trim().max(50, "50자 이내").default(""),
    fax: z.string().trim().max(50, "50자 이내").default(""),
    mobile: z.string().trim().max(50, "50자 이내").default(""),
    address_actual1: z.string().trim().max(500, "500자 이내").default(""),
    address_actual2: z.string().trim().max(500, "500자 이내").default(""),
    note: z.string().trim().max(2000).default(""),
    assignee_id: z.string().default(""),
    equipment: z.array(companyEquipmentRowSchema).default([]),
  })
  // 사업자번호: none 체크면 공란 요구, 아니면 체크섬 유효 필수.
  .refine(
    (v) => (v.biz_no_none ? v.biz_no.trim() === "" : validateBizNo(v.biz_no)),
    { message: "사업자등록번호를 입력하세요(또는 '사업자번호 없음' 체크)", path: ["biz_no"] },
  )
  // 연락처 최소 1개.
  .refine((v) => hasAnyContact(v), {
    message: "연락처(휴대폰·전화1·대표연락처)를 하나 이상 입력하세요",
    path: ["mobile"],
  })
  // 이메일 형식(값 있을 때만).
  .refine((v) => isOptionalEmailValid(v.email), {
    message: "이메일 형식이 올바르지 않습니다",
    path: ["email"],
  });

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type CompanyEquipmentRow = z.infer<typeof companyEquipmentRowSchema>;
