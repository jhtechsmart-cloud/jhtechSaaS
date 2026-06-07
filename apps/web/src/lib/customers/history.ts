import type { RequestStatus } from "@/lib/request-status";

// P-F 통합 고객이력 — RPC get_company_request_history 반환 셰이프 + 섹션 요약 파생(순수 로직).
// 견적 status는 AS·소모품(RequestStatus)과 다른 enum.
export type ApplicationStatus = "new" | "assigned" | "quoted" | "quote_sent" | "closed";

export interface HistoryApplication {
  id: string;
  seq_no: string;
  company: string;
  status: ApplicationStatus;
  created_at: string;
}

export interface HistoryServiceRequest {
  id: string;
  seq_no: string;
  status: RequestStatus;
  company_equipment_id: string | null;
  created_at: string;
}

export interface HistorySupplyItem {
  consumable_name_snapshot: string;
  qty: number;
}

export interface HistorySupplyRequest {
  id: string;
  seq_no: string;
  status: RequestStatus;
  created_at: string;
  item_count: number;
  items: HistorySupplyItem[];
}

export interface CustomerHistory {
  applications: HistoryApplication[];
  service_requests: HistoryServiceRequest[];
  supply_requests: HistorySupplyRequest[];
}

// 섹션 헤더 "전체 N · 완료 M". 완료 정의가 종류별로 다르다.
export interface SectionSummary {
  total: number;
  completed: number;
}

// 견적 완료 = closed(종결). new/assigned/quoted는 진행.
export function summarizeApplications(apps: ReadonlyArray<{ status: ApplicationStatus }>): SectionSummary {
  return {
    total: apps.length,
    completed: apps.filter((a) => a.status === "closed").length,
  };
}

// AS·소모품 완료 = done. canceled(취소)는 완료 아님(전체엔 포함).
export function summarizeRequests(reqs: ReadonlyArray<{ status: RequestStatus }>): SectionSummary {
  return {
    total: reqs.length,
    completed: reqs.filter((r) => r.status === "done").length,
  };
}
