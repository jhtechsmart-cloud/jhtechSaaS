import type { ApplicationStatus } from "@/lib/customers/history";

// 배정/해제 시 status auto-bump 판정(순수). null = status 변경 없음.
// - new + 배정 → assigned (미처리 신호 해제)
// - assigned + 해제 → new (재트리아지 풀로 복귀, 고아 assigned 방지)
// - 그 외(quoted/closed 재배정·해제, new 해제, assigned 재배정) → 변경 없음
export function nextStatusOnAssign(
  current: ApplicationStatus,
  assigneeId: string | null,
): ApplicationStatus | null {
  if (assigneeId && current === "new") return "assigned";
  if (!assigneeId && current === "assigned") return "new";
  return null;
}
