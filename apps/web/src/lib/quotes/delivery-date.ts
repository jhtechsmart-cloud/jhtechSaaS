// 납품일 마스크 입력 — 숫자 연속 입력을 YYYY-MM-DD로 점진 포맷 + 검증. 순수 로직.
// 브라우저 기본 <input type="date">는 연도(4자리 초과 가능)에서 자동 이동을 안 하므로,
// 한 칸짜리 텍스트 마스크로 대체해 커서 점프 문제 자체를 없앤다.

// 숫자만 추려 8자리까지, YYYY-MM-DD 형태로 대시를 점진 삽입한다.
export function formatDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts: string[] = [digits.slice(0, 4)];
  if (digits.length > 4) parts.push(digits.slice(4, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 8));
  return parts.join("-");
}

// 마스크 문자열을 검증한다.
// - 빈 값: iso null·에러 없음(저장 시 날짜 제거 허용)
// - 8자리 미만: 미완성 에러
// - 월/일 범위 밖: 검증 에러
// - 완성된 유효 날짜: iso(YYYY-MM-DD) 반환
export function parseDeliveryDate(masked: string): { iso: string | null; error: string | null } {
  const digits = masked.replace(/\D/g, "");
  if (digits.length === 0) return { iso: null, error: null };
  if (digits.length < 8) return { iso: null, error: "날짜를 끝까지 입력하세요 (예: 20260815)" };

  const year = digits.slice(0, 4);
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  // 연도 하한 — JS Date는 0~99를 1900~1999로 매핑하고 Postgres date는 연도 0을 거부한다.
  // 4자리 미만(예: 0026)은 오타이므로 막아, 클라가 유효로 본 값이 서버서 깨지는 일을 방지.
  if (Number(year) < 1000) return { iso: null, error: "연도를 4자리로 입력하세요" };
  if (month < 1 || month > 12) return { iso: null, error: "월은 01~12 사이여야 합니다" };
  // 해당 연·월의 마지막 날(월별 일수, 윤년 포함)을 계산해 일 범위를 검증한다.
  const daysInMonth = new Date(Number(year), month, 0).getDate();
  if (day < 1 || day > daysInMonth) return { iso: null, error: `${month}월은 ${daysInMonth}일까지입니다` };

  return { iso: `${year}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`, error: null };
}
