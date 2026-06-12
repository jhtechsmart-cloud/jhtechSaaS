// KST(Asia/Seoul) 날짜·시각 추출 순수 헬퍼 — 데모예약·대시보드 공용.
// shared/date-kst.ts(표시 포맷)와 달리 여기는 "YYYY-MM-DD"/"HH:mm" 원자값을 다룬다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 오프셋 표기 필수 — 없으면 머신 로컬타임으로 해석돼 KST 머신에서 +9h 이중 적용(shared와 동일 가드).
const HAS_OFFSET = /([zZ]|[+-]\d{2}:?\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, "0");

function kstDate(iso: string): Date | null {
  if (!HAS_OFFSET.test(iso)) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + KST_OFFSET_MS);
}

/** ISO(오프셋 필수) → KST 날짜 "YYYY-MM-DD". 잘못된 입력은 null. */
export function kstDateOf(iso: string): string | null {
  const k = kstDate(iso);
  if (!k) return null;
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

/** ISO(오프셋 필수) → KST 시각 "HH:mm". 잘못된 입력은 null. */
export function kstHmOf(iso: string): string | null {
  const k = kstDate(iso);
  if (!k) return null;
  return `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

/** 현재 KST 날짜 "YYYY-MM-DD". */
export function todayKst(now: Date = new Date()): string {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

/** "YYYY-MM-DD"에 일수를 더한다(KST 달력 산술 — UTC Date로 안전 계산). */
export function addDaysKst(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
