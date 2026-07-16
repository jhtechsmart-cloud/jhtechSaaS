import type { ServicePart } from "@jhtechsaas/shared";

// 서비스 리포트 행(서버가 RPC jsonb로 반환) — 화면에서 쓰는 필드만 좁혀 파싱.
export interface ServiceReportRow {
  id: string;
  seq_no: string;
  status: "draft" | "issued" | "voided";
  service_request_id: string | null;
  company_id: string | null;
  company_equipment_id: string | null;
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
  parts: ServicePart[];
  charge_type: "paid" | "free";
  free_reason: string | null;
  visit_fee: number;
  overtime_fee: number;
  parts_total: number;
  vat: number;
  total: number;
  signature_path: string | null;
  pdf_url: string | null;
  sender_hiworks_user_id: string | null;
  created_at: string;
  issued_at: string | null;
}

// 마법사가 서버 RPC(upsert_service_report)로 보내는 payload — RPC가 전 필드를 재검증·재계산.
export interface ReportPayload {
  company_id: string | null;
  company_equipment_id: string | null;
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

export interface OpenRequest {
  id: string;
  seq_no: string;
  status: string;
  created_at: string;
  company_equipment_id: string | null;
  symptom: string | null;
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
