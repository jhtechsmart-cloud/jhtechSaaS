// 서비스 리포트 상태 단일 출처(#285) — 값은 shared에 있고 웹은 재export만 한다.
// 배지 색·탭 매핑(#C)은 여기에 추가하되, 상태 값 자체는 절대 여기서 재정의하지 않는다.
export {
  SERVICE_REPORT_STATUSES,
  SERVICE_REPORT_FINALIZED,
  SERVICE_REPORT_MAILABLE,
  SERVICE_REPORT_STATUS_LABEL,
  TAX_INVOICE_STATUSES,
  canTransition,
} from "@jhtechsaas/shared";
export type { ServiceReportStatus, TaxInvoiceStatus } from "@jhtechsaas/shared";
