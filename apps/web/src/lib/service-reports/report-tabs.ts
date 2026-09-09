import type { ServiceReportStatus } from "@jhtechsaas/shared";
import { SERVICE_REPORT_FINALIZED, SERVICE_REPORT_MAILABLE } from "@jhtechsaas/shared";

// #285 #C — admin 목록 탭·KPI→탭 매핑·기본 탭·배지 톤 단일 출처(순수). 상태 값 자체는 shared가 원본.

export type ReportTabKey = "all" | "awaiting_approval" | "awaiting_tax" | "mail_unsent" | "follow" | "completed" | "voided";

export const REPORT_TABS: { key: ReportTabKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "awaiting_approval", label: "승인 대기" },
  { key: "awaiting_tax", label: "세금계산서 미발행" },
  { key: "mail_unsent", label: "메일 미발송" },
  { key: "follow", label: "후속조치 대기" },
  { key: "completed", label: "완료" },
  { key: "voided", label: "무효" },
];

export const isReportTabKey = (v: string | null | undefined): v is ReportTabKey =>
  REPORT_TABS.some((t) => t.key === v);

export interface ReportTabRow {
  status: ServiceReportStatus;
  follow_needed: boolean;
  follow_resolved_at: string | null;
  mail_sent: boolean; // email_log kind=customer status=sent 1건 이상
}

const isFinalized = (s: ServiceReportStatus) => (SERVICE_REPORT_FINALIZED as readonly string[]).includes(s);

export function tabMatches(tab: ReportTabKey, r: ReportTabRow): boolean {
  switch (tab) {
    case "all":
      return true;
    case "awaiting_approval":
      return r.status === "issued";
    case "awaiting_tax":
      return r.status === "approved";
    case "mail_unsent":
      return (SERVICE_REPORT_MAILABLE as readonly string[]).includes(r.status) && !r.mail_sent;
    case "follow":
      return isFinalized(r.status) && r.follow_needed && !r.follow_resolved_at;
    case "completed":
      return r.status === "completed";
    case "voided":
      return r.status === "voided";
  }
}

// 진입 시 "내 할 일" 탭(E3): 승인자 → 승인 대기, 관리부 → 세금계산서 미발행, 그 외 전체.
export function defaultTabFor(permissions: readonly string[]): ReportTabKey {
  if (permissions.includes("service_reports.approve")) return "awaiting_approval";
  if (permissions.includes("service_reports.complete")) return "awaiting_tax";
  return "all";
}

export type KpiKey = "received" | "follow_open" | "awaiting_approval" | "awaiting_tax" | "completed_this_month";

// KPI 박스 클릭 = 탭(D-B8). 접수는 의뢰 목록으로.
export function kpiTabHref(key: KpiKey): string {
  switch (key) {
    case "received":
      return "/admin/service-requests";
    case "follow_open":
      return "/admin/service-reports?tab=follow";
    case "awaiting_approval":
      return "/admin/service-reports?tab=awaiting_approval";
    case "awaiting_tax":
      return "/admin/service-reports?tab=awaiting_tax";
    case "completed_this_month":
      return "/admin/service-reports?tab=completed&period=month";
  }
}

// 상태 배지 톤(D-B5): 승인 대기=코랄 옅음(미처리) · 세금계산서 미발행=라임(주의) · 완료=민트(긍정) · 무효=코랄 · 임시=중립.
export const STATUS_BADGE_CLASS: Record<ServiceReportStatus, string> = {
  draft: "bg-surface-2 text-muted",
  issued: "bg-coral-soft text-coral-text",
  approved: "bg-lime/30 text-pine-3",
  completed: "bg-accent-soft text-accent",
  voided: "bg-danger/10 text-danger",
};

export type MailBadgeKey = "none" | "pending" | "sent" | "failed";
export const MAIL_BADGE: Record<MailBadgeKey, { label: string; className: string }> = {
  none: { label: "미발송", className: "bg-surface-2 text-muted" },
  pending: { label: "발송 대기", className: "bg-lime/30 text-pine-3" },
  sent: { label: "발송됨", className: "bg-accent-soft text-accent" },
  failed: { label: "발송 실패", className: "bg-danger/10 text-danger" },
};

// email_log(kind=customer) 상태들 → 배지 1개(최근 우선: sending/pending > sent > failed > none).
export function mailBadgeKey(statuses: readonly string[]): MailBadgeKey {
  if (statuses.some((s) => s === "pending" || s === "sending")) return "pending";
  if (statuses.includes("sent")) return "sent";
  if (statuses.includes("failed")) return "failed";
  return "none";
}
