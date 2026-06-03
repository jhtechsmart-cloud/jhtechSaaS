// 고객요청(A/S·소모품) 공통 status 색 스파인 — 단일 출처(DESIGN.md Decisions Log 2026-06-02).
// 견적 스파인 재사용 + 보류=슬레이트. service_requests(P-D)·supply_requests(P-E)가 함께 사용.
export const REQUEST_STATUSES = ["received", "in_progress", "on_hold", "done", "canceled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_META: Record<RequestStatus, { label: string; color: string }> = {
  received: { label: "접수", color: "#2563EB" },
  in_progress: { label: "진행중", color: "#D97706" },
  on_hold: { label: "보류", color: "#64748B" },
  done: { label: "완료", color: "#16A34A" },
  canceled: { label: "취소", color: "#DC2626" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-small font-medium"
      style={{ color: m.color, backgroundColor: `${m.color}1A` }}
    >
      {m.label}
    </span>
  );
}
