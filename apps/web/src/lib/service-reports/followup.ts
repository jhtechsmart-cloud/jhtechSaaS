import { SERVICE_REPORT_FINALIZED } from "@jhtechsaas/shared";
import { fmtKstMinute } from "./timeline";
import type { ReportPayload, ServiceReportRow } from "./types";
import { emptyPayloadBase } from "./payload";

// #285 #D — 후속 방문 리포트(원 리포트를 부모로 두는 새 리포트).
// 물려받는 것 = 누구의 무슨 장비인가(고객·장비·의뢰·수신처). 새로 쓰는 것 = 이번 방문에 무엇을 했나.
// ⚠️ 서명·사진은 절대 복사하지 않는다(원 리포트 서명이 새 문서에 붙으면 위조).
// 최종 불변식(자기 자신 금지·1단·같은 의뢰·같은 고객·확정 이후)은 issue RPC가 강제하고, 여기선 진입 전 안내만.

export function followUpBlockReason(parent: ServiceReportRow): string | null {
  if (parent.status === "voided") return "무효 처리된 리포트에는 후속 방문을 붙일 수 없습니다";
  if (!(SERVICE_REPORT_FINALIZED as readonly string[]).includes(parent.status)) {
    return "확정된 리포트에만 후속 방문을 붙일 수 있습니다";
  }
  if (parent.parent_report_id) return "후속 리포트에 다시 후속을 붙일 수 없습니다(1단만)";
  if (!parent.follow_needed) return "후속조치가 필요 없는 리포트입니다";
  if (parent.follow_resolved_at) return "이미 처리된 후속조치입니다";
  return null;
}

export function buildFollowUpSeed(parent: ServiceReportRow): ReportPayload {
  return {
    ...emptyPayloadBase(),
    parent_report_id: parent.id,
    company_id: parent.company_id,
    company_equipment_id: parent.company_equipment_id,
    catalog_equipment_id: parent.catalog_equipment_id,
    service_request_id: parent.service_request_id,
    customer_name: parent.customer_name ?? "",
    customer_biz_no: parent.customer_biz_no ?? "",
    customer_tel: parent.customer_tel ?? "",
    customer_addr: parent.customer_addr ?? "",
    recipient_email: parent.recipient_email ?? "",
    device_name: parent.device_name ?? "",
    device_serial: parent.device_serial ?? "",
    purchased_at: parent.purchased_at ?? "",
  };
}

export interface FollowUpReference {
  seqNo: string;
  issuedAtLabel: string;
  faults: string[];
  followLabel: string;
  actionSummary: string; // 조치 내역 최대 3줄(길면 말줄임)
}

export function followUpReference(parent: ServiceReportRow): FollowUpReference {
  const lines = (parent.action_text ?? "").split("\n");
  const actionSummary = lines.length > 3 ? `${lines.slice(0, 3).join("\n")}…` : lines.join("\n");
  return {
    seqNo: parent.seq_no,
    issuedAtLabel: fmtKstMinute(parent.issued_at) ?? "",
    faults: parent.faults ?? [],
    followLabel: `${parent.follow_memo ?? ""}${parent.follow_date ? ` (예정일 ${parent.follow_date})` : ""}`.trim(),
    actionSummary,
  };
}
