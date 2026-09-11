import type { ServiceReportStatus } from "@jhtechsaas/shared";

// #285 #C — 결재 타임라인(확정→승인→완료) + "지금 ○○ 차례 · N일 경과"(D-B15) 순수 함수. KST 표시.

export interface TimelineSource {
  status: ServiceReportStatus;
  issued_at: string | null;
  engineer_name: string | null;
  approved_at: string | null;
  approver_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  voided_at: string | null;
}

export type StepState = "done" | "current" | "todo" | "void";
export interface TimelineStep {
  key: "issued" | "approved" | "completed";
  label: string;
  state: StepState;
  by: string | null;
  at: string | null; // 'YYYY-MM-DD HH:mm' KST
}

export function fmtKstMinute(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const k = new Date(t + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

// KST 달력일 차이("3일 경과" = 오늘이 3일째) — 시각 차이가 아니라 날짜 경계 기준.
const kstDay = (ms: number) => Math.floor((ms + 9 * 3600 * 1000) / 86_400_000);
const daysBetween = (fromIso: string, now: Date): number => Math.max(0, kstDay(now.getTime()) - kstDay(Date.parse(fromIso)));

// 지금 누구 차례인지(승인 대기 = 승인자, 세금계산서 미발행 = 관리부) + 그 단계에 머문 일수.
export function describeTurn(r: TimelineSource, now: Date): { who: string; days: number } | null {
  if (r.status === "issued") return { who: "승인자(이사)", days: r.issued_at ? daysBetween(r.issued_at, now) : 0 };
  if (r.status === "approved") return { who: "관리부", days: r.approved_at ? daysBetween(r.approved_at, now) : 0 };
  return null;
}

export function buildApprovalTimeline(r: TimelineSource): TimelineStep[] {
  const order: ServiceReportStatus[] = ["issued", "approved", "completed"];
  const reached = r.status === "voided" ? (r.approved_at ? 2 : r.issued_at ? 1 : 0) : order.indexOf(r.status) + 1; // done 개수
  const steps: TimelineStep[] = [
    { key: "issued", label: "확정", state: "todo", by: r.engineer_name, at: fmtKstMinute(r.issued_at) },
    { key: "approved", label: "승인", state: "todo", by: r.approver_name, at: fmtKstMinute(r.approved_at) },
    { key: "completed", label: "완료", state: "todo", by: r.completed_by_name, at: fmtKstMinute(r.completed_at) },
  ];
  steps.forEach((s, i) => {
    if (i < reached) s.state = "done";
    else if (r.status === "voided") s.state = "void";
    else if (i === reached) s.state = "current";
  });
  return steps;
}
