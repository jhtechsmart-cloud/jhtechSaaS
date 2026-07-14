import { z } from "zod";
import { normalizeBizNo, validateBizNo } from "@jhtechsaas/shared";
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

// 수정 시 그런더링(grandfather) 판단에 쓰는 원본 값(수정 진입 시점의 DB 값).
// 이관 고객(엑셀 ~1,500건)은 대표자·주소·연락처가 비어 있거나 사업자번호가 체크섬 무효일 수 있어,
// "안 바꾼 값"까지 신규 등록 수준으로 엄격 검증하면 매 수정마다 막힌다 — 원본 대비 미변경/원래 빈 값은 통과시킨다.
export type CompanyEditOriginal = { bizNo: string; ceo: string; address: string; hasContact: boolean };

// 고객(업체) 폼 스키마 — 클라이언트(react-hook-form)와 서버액션 재검증이 공유.
// 필수: name·biz_no(단 '사업자번호 없음' 체크 시 면제)·ceo·address·연락처(최소1).
// edit가 있으면 '기존 고객 수정' 모드 — 원본(edit) 대비 그런더링. 없으면 신규 등록(항상 엄격).
export function makeCompanyFormSchema(edit?: CompanyEditOriginal) {
  return z
    .object({
      name: z.string().trim().min(1, "업체명을 입력하세요").max(200, "200자 이내"),
      biz_no: z.string().trim().max(20),
      biz_no_none: z.boolean().default(false), // 폼 전용 — DB 미저장(사업자번호 없는 고객 예외)
      // 폼 전용 — DB 미저장. 동명(name_only) 경고에서 "동명의 다른 회사가 맞습니다" 확인 체크.
      // 서버 액션이 name_only 매치 시 이 플래그 없으면 저장 거부(fail-closed).
      name_only_confirmed: z.boolean().default(false),
      // 필수 강제는 아래 object-level refine으로(그런더링을 위해 field-level .min 제거).
      ceo: z.string().trim().max(200),
      // 담당자(고객 측)·업태 — 기본 정보(견적 신청기업 정보와 1:1).
      manager: z.string().trim().max(200, "200자 이내").default(""),
      // 담당자 직책 — 견적서 PDF "[회사][담당자][직책] 귀하"에 사용.
      manager_title: z.string().trim().max(100, "100자 이내").default(""),
      phone: z.string().trim().max(50).default(""),
      email: z.string().trim().max(200).default(""),
      address: z.string().trim().max(500, "500자 이내"), // 필수는 아래 refine에서.
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
    // 사업자번호: none이면 공란 요구. 아니면 — 수정 중 원본과 동일(정규화 비교)하면 체크섬 재검증 생략
    // (그런더링), 새 값으로 바뀌었으면 체크섬 검증(신규 등록도 항상 이 경로).
    .refine(
      (v) => {
        if (v.biz_no_none) return v.biz_no.trim() === "";
        if (edit && normalizeBizNo(v.biz_no) === normalizeBizNo(edit.bizNo)) return true;
        return validateBizNo(v.biz_no);
      },
      { message: "사업자등록번호를 입력하세요(또는 '사업자번호 없음' 체크)", path: ["biz_no"] },
    )
    // 대표자: 필수. 단 수정 중 원본이 비어 있었으면 빈 값 허용(그런더링) — 원본에 값이 있었으면 계속 필수(비우기 방지).
    .refine((v) => v.ceo.trim() !== "" || (!!edit && edit.ceo.trim() === ""), {
      message: "대표자를 입력하세요",
      path: ["ceo"],
    })
    // 주소: 필수. 단 수정 중 원본이 비어 있었으면 허용.
    .refine((v) => v.address.trim() !== "" || (!!edit && edit.address.trim() === ""), {
      message: "주소를 입력하세요",
      path: ["address"],
    })
    // 연락처 최소 1개. 단 수정 중 원본에 연락처가 하나도 없었으면 허용.
    .refine((v) => hasAnyContact(v) || (!!edit && !edit.hasContact), {
      message: "연락처(휴대폰·전화1·대표연락처)를 하나 이상 입력하세요",
      path: ["mobile"],
    })
    // 이메일 형식(값 있을 때만) — create/edit 동일.
    .refine((v) => isOptionalEmailValid(v.email), {
      message: "이메일 형식이 올바르지 않습니다",
      path: ["email"],
    });
}

// 신규 등록(항상 엄격) — 기존 이름 유지(타입 export·createCustomer·CompanyForm create 모드가 사용).
export const companyFormSchema = makeCompanyFormSchema();
export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type CompanyEquipmentRow = z.infer<typeof companyEquipmentRowSchema>;
