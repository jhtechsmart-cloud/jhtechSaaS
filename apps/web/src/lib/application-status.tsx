// 견적(applications) status 색 스파인 — request-status(AS·소모품)와 대칭이나 enum이 다르다.
// 라이프사이클(2026-06-18): 접수→배정→견적중→견적발송→납품완료→수금중→수금완료, +종료(중단/종결).
// 이 파일이 상태 단일 출처 — 배열·진행중/완료군 셋·색·배지가 여기서 파생된다.
import type { ApplicationStatus } from "@/lib/customers/history";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "new",
  "assigned",
  "quoted",
  "quote_sent",
  "delivered",
  "collecting",
  "collected",
  "closed",
] as const;

// 진행중(active) = 수금완료·종료를 뺀 전부. 목록 '진행중' 탭·대시보드 진행중 KPI의 단일 출처.
export const ACTIVE_APPLICATION_STATUSES = [
  "new",
  "assigned",
  "quoted",
  "quote_sent",
  "delivered",
  "collecting",
] as const satisfies readonly ApplicationStatus[];

// 완료군 = 수금완료(전체완료) + 종료(중단/종결). 목록 '완료' 탭의 단일 출처.
export const DONE_APPLICATION_STATUSES = ["collected", "closed"] as const satisfies readonly ApplicationStatus[];

// 미수금 = 납품완료·수금중(물건은 나갔는데 수금 미완). 대시보드 미수금 위젯의 단일 출처.
export const UNPAID_APPLICATION_STATUSES = ["delivered", "collecting"] as const satisfies readonly ApplicationStatus[];

// 라이트 민트 테마(2026-06-12): 배지 = 미처리(코랄옅음)/중립(muted)/긍정(민트) 3톤.
// color = 대시보드 막대·도넛 공용 단색 포인트(코랄=미처리·라임/소프트그린=중립·틸/파인=긍정) — 5색 상호 구분.
export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; color: string; fg: string; bg: string }
> = {
  new: { label: "접수", color: "#E98668", fg: "#C25434", bg: "#FDEEE8" }, // 미처리 — 주의 환기
  assigned: { label: "배정", color: "#D3E478", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립
  quoted: { label: "견적중", color: "#BFE6C1", fg: "#4D6B63", bg: "#EEF5F2" }, // 중립
  quote_sent: { label: "견적발송", color: "#34B8A5", fg: "#176455", bg: "#D9F3E9" }, // 긍정(견적 단계 완료)
  delivered: { label: "납품완료", color: "#3E7BC0", fg: "#2C5A8F", bg: "#E3EDF7" }, // 파랑 — 납품(캘린더 납품색과 일치)
  collecting: { label: "수금중", color: "#A9BC2F", fg: "#5F6E1A", bg: "#F2F5DE" }, // 라임 — 수금 진행
  collected: { label: "수금완료", color: "#176455", fg: "#176455", bg: "#D9F3E9" }, // 파인 — 전체완료(최종 성공)
  closed: { label: "종료", color: "#92ACA4", fg: "#5E7C73", bg: "#EEF5F2" }, // 중립 — 중단/종결(수금완료와 구분)
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
