// 견적(applications) status 색 스파인 — request-status(AS·소모품)와 대칭이나 enum이 다르다.
// new/assigned/quoted/closed. P-F 통합 고객이력·향후 E4(견적 admin 콘솔)에서 재사용.
import type { ApplicationStatus } from "@/lib/customers/history";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "new",
  "assigned",
  "quoted",
  "quote_sent",
  "closed",
] as const;

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  new: { label: "접수", color: "#2563EB" },
  assigned: { label: "배정", color: "#7C3AED" },
  quoted: { label: "견적중", color: "#D97706" },
  quote_sent: { label: "견적발송", color: "#16A34A" }, // 발행됨(발송 성공 — DESIGN.md 스파인 green)
  closed: { label: "완료", color: "#3a3770" }, // 건 종결(네이비)
};

// testId: 상세의 "권위 상태" 단언용 data-testid(기본 "app-status"). 목록처럼 여러 배지가
// 한 화면에 공존하는 곳은 testId={null}로 꺼서 strict-mode 충돌을 피한다.
export function ApplicationStatusBadge({
  status,
  testId = "app-status",
}: {
  status: ApplicationStatus;
  testId?: string | null;
}) {
  const m = APPLICATION_STATUS_META[status];
  return (
    <span
      {...(testId ? { "data-testid": testId } : {})}
      className="inline-block rounded-sm px-2 py-0.5 text-small font-medium"
      style={{ color: m.color, backgroundColor: `${m.color}1A` }}
    >
      {m.label}
    </span>
  );
}
