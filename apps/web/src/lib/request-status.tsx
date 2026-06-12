// 고객요청(A/S·소모품) 공통 status 색 스파인 — 단일 출처(DESIGN.md Decisions Log 2026-06-02).
// 견적 스파인 재사용 + 보류=슬레이트. service_requests(P-D)·supply_requests(P-E)가 함께 사용.
export const REQUEST_STATUSES = ["received", "in_progress", "on_hold", "done", "canceled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// 라이트 민트 테마(2026-06-12): 배지 3톤(미처리=코랄옅음/중립=muted/긍정=민트), color=장식용 포인트.
export const STATUS_META: Record<RequestStatus, { label: string; color: string; fg: string; bg: string }> = {
  received: { label: "접수", color: "#E98668", fg: "#C25434", bg: "#FDEEE8" }, // 미처리
  in_progress: { label: "진행중", color: "#D3E478", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립
  on_hold: { label: "보류", color: "#C8D8D2", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립(멈춤)
  done: { label: "완료", color: "#34B8A5", fg: "#176455", bg: "#D9F3E9" }, // 긍정
  canceled: { label: "취소", color: "#9F3F26", fg: "#C25434", bg: "#FDEEE8" }, // 부정
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-small font-semibold"
      style={{ color: m.fg, backgroundColor: m.bg }}
    >
      {m.label}
    </span>
  );
}
