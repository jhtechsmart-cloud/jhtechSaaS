// 데모예약 슬롯·충돌 순수 로직 — 모두 KST 문자열("YYYY-MM-DD"·"HH:mm") 기반.
// Date 객체/타임존 연산을 피하고 분 산술만 사용해 서버·클라 어디서든 동일 결과를 보장한다.

import { CLOSE_HOUR, OPEN_HOUR, SLOT_MINUTES } from "./constants";

export interface TimeSpan {
  /** 시작 "HH:mm" (포함). */
  start: string;
  /** 종료 "HH:mm" (미포함 — 반개구간 [start,end), DB tstzrange와 동일). */
  end: string;
}

/** "HH:mm" → 자정 기준 분. */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 분 → "HH:mm" (2자리 패딩). */
function toHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 시작 가능 슬롯 09:00~17:45, 15분 간격 36개. */
export const SLOT_TIMES: readonly string[] = Array.from(
  { length: ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES },
  (_, i) => toHHmm(OPEN_HOUR * 60 + i * SLOT_MINUTES),
);

/** "HH:mm"에 분을 더한다(자정 넘김 미고려 — 운영시간 검증이 별도로 막음). */
export function addMinutesHHmm(hhmm: string, minutes: number): string {
  return toHHmm(toMin(hhmm) + minutes);
}

/** 날짜+시작+소요 → KST 오프셋(+09:00) 명시 ISO 쌍. DB tstzrange 입력용. */
export function kstRangeIso(
  date: string,
  startHHmm: string,
  durationMin: number,
): { startIso: string; endIso: string } {
  const endHHmm = addMinutesHHmm(startHHmm, durationMin);
  return {
    startIso: `${date}T${startHHmm}:00+09:00`,
    endIso: `${date}T${endHHmm}:00+09:00`,
  };
}

/** 반개구간 [start,end) 둘의 겹침 여부 — 경계 접촉(끝=시작)은 겹침 아님. */
export function overlapsRange(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);
}

export interface SlotSelection {
  /** 선택 범위가 덮는 15분 슬롯들("HH:mm"). 범위 하이라이트용. */
  slots: string[];
  /** 기존 예약과 겹침 여부 — true면 경고 배너 + 저장 비활성. */
  conflict: boolean;
  /** 종료가 운영 종료(18:00)를 넘는지. */
  exceedsClose: boolean;
}

/** 시작+소요시간 선택의 범위·충돌·운영시간 판정 — 소요시간 변경 시 재호출로 재계산. */
export function computeSelection(
  startHHmm: string,
  durationMin: number,
  existing: readonly TimeSpan[],
): SlotSelection {
  const start = toMin(startHHmm);
  const end = start + durationMin;
  const slots: string[] = [];
  for (let t = start; t < end; t += SLOT_MINUTES) slots.push(toHHmm(t));
  const endHHmm = toHHmm(end);
  return {
    slots,
    conflict: existing.some((e) =>
      overlapsRange(startHHmm, endHHmm, e.start, e.end),
    ),
    exceedsClose: end > CLOSE_HOUR * 60,
  };
}

/** 기존 예약들이 걸친 15분 슬롯 전부(disabled+취소선 표시용). 종료 경계 슬롯은 비점유. */
export function occupiedSlotSet(existing: readonly TimeSpan[]): Set<string> {
  const set = new Set<string>();
  for (const e of existing) {
    for (let t = toMin(e.start); t < toMin(e.end); t += SLOT_MINUTES) {
      set.add(toHHmm(t));
    }
  }
  return set;
}
