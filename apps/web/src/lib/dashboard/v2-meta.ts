// 대시보드 v2 이벤트 5종 색 메타 — 단일 출처(캘린더 칩·범례·일정 레일 공용).
// 스펙 매핑: 견적=파인 · A/S=코랄 · 소모품=라임 · 데모=틸 · 납품=파랑.

import type { ActivityType, CalendarEventType } from "./v2-logic";

export const EVENT_META: Record<
  CalendarEventType,
  { label: string; color: string; bg: string; fg: string }
> = {
  quote: { label: "견적", color: "#176455", bg: "#D9F3E9", fg: "#0F4439" },
  service: { label: "A/S", color: "#E98668", bg: "#FDEEE8", fg: "#A8442A" },
  supply: { label: "소모품", color: "#A9BC2F", bg: "#F4F8DC", fg: "#5F6B1B" },
  demo: { label: "데모", color: "#34B8A5", bg: "#DEF4EF", fg: "#176455" },
  delivery: { label: "납품", color: "#3E7BC0", bg: "#E3EEF9", fg: "#2D5C94" },
};

/** 주간 활동 블록 색(견적·A/S·소모품) — EVENT_META의 부분집합. */
export const ACTIVITY_META: Record<ActivityType, { label: string; color: string }> = {
  quote: { label: "견적", color: EVENT_META.quote.color },
  service: { label: "A/S", color: EVENT_META.service.color },
  supply: { label: "소모품", color: EVENT_META.supply.color },
};
