// 서비스 리포트 상태기계 단일 출처(#285) — DB CHECK·트리거 전이표·웹 배지·워커 가드가 전부 이 값을 참조한다.
// ⚠️ 상태 추가 시 DB CHECK(20260909170000)·트리거 전이표(20260909170001)와 반드시 동기.
//
//   draft ──issue──▶ issued ──approve──▶ approved ──complete──▶ completed
//                      │                    │
//                      └──void(관리자)───────┴──▶ voided        completed→voided ✗
export const SERVICE_REPORT_STATUSES = ["draft", "issued", "approved", "completed", "voided"] as const;
export type ServiceReportStatus = (typeof SERVICE_REPORT_STATUSES)[number];

/** 발행 이후 유효 문서 — 이력·통계·PDF 렌더·후속 처리 대상. voided 제외. */
export const SERVICE_REPORT_FINALIZED = ["issued", "approved", "completed"] as const satisfies readonly ServiceReportStatus[];

/** 고객 메일 발송 가능(승인본만 — 미승인본은 고객에게 나가지 않는다). */
export const SERVICE_REPORT_MAILABLE = ["approved", "completed"] as const satisfies readonly ServiceReportStatus[];

/** 화면 라벨 — issued=승인 대기(결재 미처리), approved=세금계산서 미발행(관리부 확인 대기). */
export const SERVICE_REPORT_STATUS_LABEL: Record<ServiceReportStatus, string> = {
  draft: "임시",
  issued: "승인 대기",
  approved: "세금계산서 미발행",
  completed: "완료",
  voided: "무효",
};

/** 관리부 완료 시 기록하는 세금계산서 상태. 리포트 status 'issued'와 혼동 금지 → 'invoiced'. */
export const TAX_INVOICE_STATUSES = ["invoiced", "not_required"] as const;
export type TaxInvoiceStatus = (typeof TAX_INVOICE_STATUSES)[number];

/** 허용 전이표 — DB 트리거(20260909170001)와 동일. */
const TRANSITIONS: Record<ServiceReportStatus, readonly ServiceReportStatus[]> = {
  draft: ["issued"],
  issued: ["approved", "voided"],
  approved: ["completed", "voided"],
  completed: [],
  voided: [],
};

export function canTransition(from: ServiceReportStatus, to: ServiceReportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
