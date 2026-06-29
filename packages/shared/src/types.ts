// 도메인 타입 — Postgres 스키마(6테이블)와 대응. 쿼리·폼이 붙으면서 정교화된다.
// 단일테넌트라 tenant_id 없음. 권한 키는 PermissionKey(permissions.ts) 참조.

import type { PermissionKey } from "./permissions";
import type { SpecGroup } from "./specs";

// 라이프사이클 8상태(2026-06-18). 접수→배정→견적중→견적발송→납품완료→수금중→수금완료, +종료.
export type ApplicationStatus =
  | "new"
  | "assigned"
  | "quoted"
  | "quote_sent"
  | "delivered"
  | "collecting"
  | "collected"
  | "closed";
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
  category_id: string | null;   // 분류 노드 FK (소스)
  category: string | null;      // 분류명(조인 결과, listEquipment가 채움). 표시 전용.
  base_price: number;
  photos: string[];
  highlights: string[];      // 요약 불릿(P-A)
  specs: SpecGroup[];        // 아이콘 그룹 구조(P-A)
  youtube_urls: string[];    // 복수 영상(P-A)
  status: EquipmentStatus;
  is_demo: boolean;          // 데모 가능 장비 여부(데모예약 폼 노출)
  created_at: string;
}

/** 공개 뷰 equipment_public — 가격·옵션 제외(/spec D5). anon 상세 페이지용. */
export interface EquipmentPublic {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
  highlights: string[];
  specs: SpecGroup[];
  youtube_urls: string[];
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
  equipment_id: string | null;            // FK(P-A)
  privacy_consent: boolean;               // 동의 여부(P-A)
  privacy_consent_at: string | null;      // 동의 시각(P-A)
  privacy_consent_version: string | null; // 동의 버전(P-A)
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
