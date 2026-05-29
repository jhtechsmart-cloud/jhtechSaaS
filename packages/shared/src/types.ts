// 도메인 타입 — Postgres 스키마(6테이블)와 대응. 쿼리·폼이 붙으면서 정교화된다.
// 단일테넌트라 tenant_id 없음. 권한 키는 PermissionKey(permissions.ts) 참조.

import type { PermissionKey } from "./permissions";

export type ApplicationStatus = "new" | "assigned" | "quoted" | "closed";
export type QuoteStatus = "draft" | "issued";
export type EmailStatus = "pending" | "sent" | "failed";
export type EquipmentStatus = "active" | "inactive";
export type EquipmentOptionKind = "included" | "extra";

export interface Profile {
  id: string; // = auth.users.id
  name: string;
  permissions: PermissionKey[];
  is_active: boolean;
  created_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  base_price: number;
  photos: string[];
  specs: Record<string, unknown>;
  youtube_url: string | null;
  status: EquipmentStatus;
  created_at: string;
}

/** 공개 뷰 equipment_public — 가격·옵션 제외(/spec D5). anon 상세 페이지용. */
export interface EquipmentPublic {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
  specs: Record<string, unknown>;
  youtube_url: string | null;
  created_at: string;
}

export interface EquipmentOption {
  id: string;
  equipment_id: string;
  kind: EquipmentOptionKind;
  name: string;
  price: number;
}

export interface Application {
  id: string;
  seq_no: string; // REQ-YYYYMMDD-NNNNN
  company: string;
  ceo: string | null;
  biz_no: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ApplicationStatus;
  assignee_id: string | null;
  fields: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  application_id: string;
  quote_no: string;
  version: number;
  items: unknown[];
  options: unknown[];
  supply_price: number;
  tax_price: number;
  total: number;
  pdf_url: string | null;
  status: QuoteStatus;
  assignee_id: string | null;
  issued_at: string | null;
  created_at: string;
}

export interface EmailLog {
  id: string;
  application_id: string | null;
  quote_id: string | null;
  to_email: string;
  status: EmailStatus;
  retry_count: number;
  error_msg: string | null;
  sent_at: string | null;
  created_at: string;
}
