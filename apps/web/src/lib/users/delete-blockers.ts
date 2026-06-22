// 사용자 하드 삭제 차단 사유(담당 건) — 순수 표현 로직. server-only 아님 → 클라/서버 공용.
// 담당자(assignee) 참조가 있는 테이블별 건수. 0이 아닌 항목이 있으면 삭제 차단(재배정 필요).

export type DeleteUserBlockers = {
  companies: number;
  applications: number;
  quotes: number;
  supply_requests: number;
  service_requests: number;
};

// 표시 순서 = 객체 키 순서. 라벨은 화면 안내용.
const LABELS: Record<keyof DeleteUserBlockers, string> = {
  companies: "담당 고객사",
  applications: "담당 의뢰",
  quotes: "담당 견적",
  supply_requests: "담당 소모품 의뢰",
  service_requests: "담당 A/S 의뢰",
};

/** 차단 건이 하나라도 있으면 true. */
export function hasDeleteBlockers(b: DeleteUserBlockers): boolean {
  return (Object.keys(LABELS) as (keyof DeleteUserBlockers)[]).some((k) => b[k] > 0);
}

/** 0이 아닌 항목만 "라벨 N건"으로 나열(쉼표 구분). 전부 0이면 빈 문자열. */
export function formatDeleteBlockers(b: DeleteUserBlockers): string {
  return (Object.keys(LABELS) as (keyof DeleteUserBlockers)[])
    .filter((k) => b[k] > 0)
    .map((k) => `${LABELS[k]} ${b[k]}건`)
    .join(", ");
}
