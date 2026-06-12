// PostgREST가 내려주는 tstzrange 원문 파서 — 순수 함수.
// 예: ["2026-07-01 05:00:00+00","2026-07-01 06:30:00+00")

/** tstzrange 원문 → ISO 쌍. 형식이 다르면 null(방어적 — 외부 입력 직신뢰 금지). */
export function parseTstzRange(
  raw: string,
): { startIso: string; endIso: string } | null {
  const m = /^[[(]"?([^",]+)"?\s*,\s*"?([^",)\]]+)"?[)\]]$/.exec(raw.trim());
  if (!m) return null;
  const toIso = (s: string): string | null => {
    // "2026-07-01 05:00:00+00" → "2026-07-01T05:00:00+00:00" (Date 파싱 가능 형태로 정규화)
    let v = s.trim().replace(" ", "T");
    if (/[+-]\d{2}$/.test(v)) v = `${v}:00`;
    return Number.isNaN(new Date(v).getTime()) ? null : v;
  };
  const startIso = toIso(m[1]);
  const endIso = toIso(m[2]);
  if (!startIso || !endIso) return null;
  return { startIso, endIso };
}

/** ISO 쌍의 분 차이(소요시간). 잘못된 입력은 0. */
export function durationMinOf(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}
