// UTC ISO(timestamptz) → KST(Asia/Seoul, +9h) 표시 변환 — 웹 화면·워커 PDF 공용.
// DB는 UTC로 내려주므로 slice로 자르면 KST 자정~09시 구간의 날짜가 하루 전으로 밀린다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type KstParts = { year: number; month: number; day: number; hour: number; minute: number };

function kstParts(iso: string): KstParts | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const k = new Date(ms + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** KST 날짜 `YYYY.MM.DD`. 잘못된 입력은 null. */
export function formatKstDate(iso: string): string | null {
  const p = kstParts(iso);
  if (!p) return null;
  return `${p.year}.${pad(p.month)}.${pad(p.day)}`;
}

/** KST 일시 `YYYY.MM.DD · HH:mm`. 잘못된 입력은 null. */
export function formatKstDateTime(iso: string): string | null {
  const p = kstParts(iso);
  if (!p) return null;
  return `${p.year}.${pad(p.month)}.${pad(p.day)} · ${pad(p.hour)}:${pad(p.minute)}`;
}

/** KST 한국식 날짜 `YYYY년 M월 D일`(견적서 PDF 표기). 잘못된 입력은 null. */
export function formatKstKoreanDate(iso: string): string | null {
  const p = kstParts(iso);
  if (!p) return null;
  return `${p.year}년 ${p.month}월 ${p.day}일`;
}
