import type { ReportPayload, ServiceReportRow } from "./types";

// 현장 마법사 payload 조립(순수) — 빈 폼 기본값과 행→payload 변환.
// 클라 컴포넌트 밖(서버 액션·후속 리포트 시드)에서도 쓰므로 별도 모듈로 둔다(#285 #D).

export function emptyPayloadBase(): ReportPayload {
  return {
    company_id: null,
    company_equipment_id: null,
    catalog_equipment_id: null,
    service_request_id: null,
    customer_name: "",
    customer_biz_no: "",
    customer_tel: "",
    customer_addr: "",
    recipient_email: "",
    device_name: "",
    device_serial: "",
    purchased_at: "",
    faults: [],
    diagnosis: "",
    action_text: "",
    photos_before: [],
    photos_after: [],
    signature_path: "",
    engineer_signature_path: "",
    parent_report_id: null,
    follow_needed: false,
    follow_memo: "",
    follow_date: "",
    parts: [],
    charge_type: "paid",
    free_reason: "",
    visit_fee: 0,
    overtime_fee: 0,
  };
}

export function rowToPayload(r: ServiceReportRow): ReportPayload {
  return {
    company_id: r.company_id,
    company_equipment_id: r.company_equipment_id,
    catalog_equipment_id: r.catalog_equipment_id,
    service_request_id: r.service_request_id,
    customer_name: r.customer_name ?? "",
    customer_biz_no: r.customer_biz_no ?? "",
    customer_tel: r.customer_tel ?? "",
    customer_addr: r.customer_addr ?? "",
    recipient_email: r.recipient_email ?? "",
    device_name: r.device_name ?? "",
    device_serial: r.device_serial ?? "",
    purchased_at: r.purchased_at ?? "",
    faults: r.faults ?? [],
    diagnosis: r.diagnosis ?? "",
    action_text: r.action_text ?? "",
    photos_before: r.photos_before ?? [],
    photos_after: r.photos_after ?? [],
    signature_path: r.signature_path ?? "",
    engineer_signature_path: r.engineer_signature_path ?? "",
    parent_report_id: r.parent_report_id ?? null,
    follow_needed: r.follow_needed ?? false,
    follow_memo: r.follow_memo ?? "",
    follow_date: r.follow_date ?? "",
    parts: r.parts ?? [],
    charge_type: r.charge_type ?? "paid",
    free_reason: r.free_reason ?? "",
    visit_fee: r.visit_fee ?? 0,
    overtime_fee: r.overtime_fee ?? 0,
  };
}
