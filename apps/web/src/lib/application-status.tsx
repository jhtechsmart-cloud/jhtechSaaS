// 견적(applications) status 색 스파인 — request-status(AS·소모품)와 대칭이나 enum이 다르다.
// new/assigned/quoted/closed. P-F 통합 고객이력·향후 E4(견적 admin 콘솔)에서 재사용.
import type { ApplicationStatus } from "@/lib/customers/history";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "new",
  "assigned",
  "quoted",
  "closed",
] as const;

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  new: { label: "접수", color: "#2563EB" },
  assigned: { label: "배정", color: "#D97706" },
  quoted: { label: "견적발송", color: "#7C3AED" },
  closed: { label: "완료", color: "#16A34A" },
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const m = APPLICATION_STATUS_META[status];
  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-small font-medium"
      style={{ color: m.color, backgroundColor: `${m.color}1A` }}
    >
      {m.label}
    </span>
  );
}
