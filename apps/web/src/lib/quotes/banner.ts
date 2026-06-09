// 의뢰 상세 상단 배너의 순수 로직 — 서버 의존 없이 단위테스트 가능.
// "대표 견적"(고객에게 나간 금액 우선)과 "유효기간"(발행일+30일, KST 표시전용)을 계산한다.
// 유효기간은 DB 컬럼이 아니라 화면 계산값 — 실제 유효기간 관리가 필요해지면 데이터모델로 승격.

// 배너가 쓰는 최소 견적 형태(QuoteListItem의 부분집합).
export type BannerQuote = {
  id: string;
  quote_no: string;
  version: number;
  status: string; // 'draft' | 'issued'
  total: string; // numeric → 문자열
  issued_at: string | null;
};

// 대표 견적 = 발행본(issued) 중 최신 version. 발행본이 없으면 전체 중 최신 version.
// 목록 정렬 순서에 의존하지 않는다(version으로 직접 선택).
export function pickRepresentativeQuote<T extends { version: number; status: string }>(
  quotes: T[],
): T | null {
  if (quotes.length === 0) return null;
  const issued = quotes.filter((q) => q.status === "issued");
  const pool = issued.length > 0 ? issued : quotes;
  return pool.reduce((best, q) => (q.version > best.version ? q : best));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 견적 유효기간(일) — 화면 표시·라벨에 공통 사용. 변경 시 표시 라벨도 자동 반영.
export const VALID_DAYS = 30;

// KST 자정 기준 일(day) 인덱스 — admin-search.ts와 동일 규약.
function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

export type QuoteValidity = {
  validUntilLabel: string; // KST YYYY-MM-DD
  daysLeft: number; // 만료까지 남은 일수(음수=지남)
};

// 유효기간 = 발행일 + VALID_DAYS(30일). 미발행(issued_at null)이면 null(아직 '발행 시 시작').
export function computeQuoteValidity(issuedAtIso: string | null, now: Date): QuoteValidity | null {
  if (!issuedAtIso) return null;
  const issuedMs = new Date(issuedAtIso).getTime();
  const expireMs = issuedMs + VALID_DAYS * DAY_MS;

  // 표시 라벨: KST 기준 만료 날짜를 YYYY-MM-DD로.
  const kstExpire = new Date(expireMs + KST_OFFSET_MS);
  const yyyy = kstExpire.getUTCFullYear();
  const mm = String(kstExpire.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kstExpire.getUTCDate()).padStart(2, "0");
  const validUntilLabel = `${yyyy}-${mm}-${dd}`;

  const daysLeft = kstDayIndex(expireMs) - kstDayIndex(now.getTime());
  return { validUntilLabel, daysLeft };
}
