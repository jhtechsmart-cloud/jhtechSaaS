// 데모센터 운영 상수 — 단일 출처. UI(슬롯 그리드)·서버 검증(zod)·가동률 계산이 공유한다.

/** 운영 시작(시, KST). */
export const OPEN_HOUR = 9;
/** 운영 종료(시, KST) — 종료 시각은 이 시각 이하여야 한다. */
export const CLOSE_HOUR = 18;
/** 슬롯 단위(분). */
export const SLOT_MINUTES = 15;
/** 소요 시간 옵션(분). */
export const DURATION_OPTIONS = [30, 60, 90, 120] as const;
export type DurationOption = (typeof DURATION_OPTIONS)[number];
