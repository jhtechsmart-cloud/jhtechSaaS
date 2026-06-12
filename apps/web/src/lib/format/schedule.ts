// 일정 표시 공용 포맷 — 대시보드 일정 레일·이번 달 신청·최근 활동·데모예약이 공유.
// 날짜는 KST "YYYY-MM-DD" 원자값(kst.ts가 생성)을 받는 순수 함수.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD" → "M/D (요일)". 형식 불일치는 null. */
export function formatMonthDayWeekday(dateKst: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKst);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return `${Number(mo)}/${Number(d)} (${WEEKDAYS[dow]})`;
}

/** 시작·종료 "HH:mm" → "14:00–15:30" / 종료 없으면 시작만 / 둘 다 없으면 null(시간 미정). */
export function formatHmRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start) return null;
  return end ? `${start}–${end}` : start;
}

/** 상대시간 — "방금 전"/"N분 전"/"N시간 전"/"N일 전". 미래·잘못된 입력은 null. */
export function formatRelative(iso: string, nowIso: string): string | null {
  const t = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(now)) return null;
  const sec = Math.floor((now - t) / 1000);
  if (sec < 0) return null;
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}
