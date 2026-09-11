import type { ServicePart, ServiceReportStatus } from "@jhtechsaas/shared";

// 서비스 리포트 행(서버가 RPC jsonb로 반환) — 화면에서 쓰는 필드만 좁혀 파싱.
export interface ServiceReportRow {
  id: string;
  seq_no: string;
  status: ServiceReportStatus; // #285: draft→issued→approved→completed(+voided)
  service_request_id: string | null;
  company_id: string | null;
  company_equipment_id: string | null;
  catalog_equipment_id: string | null; // 카탈로그 링크(모델 집계 단일 원본) — 확정 시 서버가 기록
  customer_name: string;
  customer_biz_no: string | null;
  customer_tel: string | null;
  customer_addr: string | null;
  recipient_email: string | null;
  device_name: string;
  device_serial: string | null;
  purchased_at: string | null;
  faults: string[];
  diagnosis: string;
  action_text: string;
  photos_before: string[];
  photos_after: string[];
  follow_needed: boolean;
  follow_memo: string | null;
  follow_date: string | null;
  follow_resolved_at: string | null; // 후속 방문 리포트 확정 또는 수동 처리 시 기록
  parts: ServicePart[];
  charge_type: "paid" | "free";
  free_reason: string | null;
  visit_fee: number;
  overtime_fee: number;
  parts_total: number;
  vat: number;
  total: number;
  signature_path: string | null;
  engineer_signature_path: string | null; // #285 기사 서명(<id>/engineer-signature.png)
  parent_report_id: string | null; // #285 후속 방문 리포트의 원 리포트(1단만)
  pdf_url: string | null;
  sender_hiworks_user_id: string | null;
  created_at: string;
  issued_at: string | null;
}

// 마법사가 서버 RPC(upsert_service_report)로 보내는 payload — RPC가 전 필드를 재검증·재계산.
export interface ReportPayload {
  company_id: string | null;
  company_equipment_id: string | null;
  catalog_equipment_id: string | null; // 피커로 고른 카탈로그 장비(보유장비 선택 시 서버가 파생)
  service_request_id: string | null;
  customer_name: string;
  customer_biz_no: string;
  customer_tel: string;
  customer_addr: string;
  recipient_email: string;
  device_name: string;
  device_serial: string;
  purchased_at: string;
  faults: string[];
  diagnosis: string;
  action_text: string;
  photos_before: string[];
  photos_after: string[];
  signature_path: string;
  engineer_signature_path: string; // 빈 값 = 미서명(RPC가 null로 저장)
  parent_report_id: string | null; // 후속 방문이면 원 리포트 id(확정 RPC가 불변식 검증)
  follow_needed: boolean;
  follow_memo: string;
  follow_date: string;
  parts: ServicePart[];
  charge_type: "paid" | "free";
  free_reason: string;
  visit_fee: number;
  overtime_fee: number;
}

export interface CompanyHit {
  id: string;
  name: string;
  biz_no: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface EquipmentItem {
  id: string;
  label: string; // 표시명(카탈로그 name 또는 자유 label)
  serial_no: string | null;
  purchased_at: string | null;
  history: { issuedAt: string; summary: string }[]; // 과거 issued 리포트(최근순)
}

// 장비 카탈로그 분류 그룹 — 미등록 장비 선택 피커용(equipmentCatalogAction).
// name은 표시명(동명 행 구분을 위해 모델 병기된 값), model은 보조 표기용 원본.
export interface CatalogGroup {
  category: string;
  items: { id: string; name: string; model: string | null }[];
}

export interface OpenRequest {
  id: string;
  seq_no: string;
  status: string;
  created_at: string;
  company_equipment_id: string | null;
  symptom: string | null;
}

// 후속 방문 대기 카드(현장 홈) — 확정본 중 후속조치가 남은 리포트(#285 #D)
export interface FollowUpCard {
  id: string;
  seq_no: string;
  customer_name: string;
  device_name: string;
  follow_memo: string | null;
  follow_date: string | null;
  issued_at: string | null;
}

export interface DraftCard {
  id: string;
  customer_name: string;
  device_name: string;
  created_at: string;
}

export type PdfStatus =
  | { state: "ready"; pdf_url: string }
  | { state: "processing" }
  | { state: "failed"; error: string }
  | { state: "none" };

export type EmailStatus = "sent" | "pending" | "sending" | "failed" | "skipped";
