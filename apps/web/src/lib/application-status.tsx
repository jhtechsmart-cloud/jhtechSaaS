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

// 라이트 민트 테마(2026-06-12): 배지 = 미처리(코랄옅음)/중립(muted)/긍정(민트) 3톤.
// color = 대시보드 막대·도넛 공용 단색 포인트(코랄=미처리·라임/소프트그린=중립·틸/파인=긍정) — 5색 상호 구분.
export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; color: string; fg: string; bg: string }
> = {
  new: { label: "접수", color: "#E98668", fg: "#C25434", bg: "#FDEEE8" }, // 미처리 — 주의 환기
  assigned: { label: "배정", color: "#D3E478", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립
  quoted: { label: "견적중", color: "#BFE6C1", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립
  quote_sent: { label: "견적발송", color: "#34B8A5", fg: "#176455", bg: "#D9F3E9" }, // 긍정
  closed: { label: "완료", color: "#176455", fg: "#176455", bg: "#D9F3E9" }, // 긍정(종결)
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
      className="inline-block rounded-full px-2.5 py-0.5 text-small font-semibold"
      style={{ color: m.fg, backgroundColor: m.bg }}
    >
      {m.label}
    </span>
  );
}
