// #244 모델별 AS 통계 — 집계 순수함수 4종.
// 계약(전처리 내재화): voided 필터·null 드롭·그룹 내 정렬은 각 함수 내부 책임(+제외 건수 반환).
// 입력은 모델 무관 EquipmentReportRow[] — 향후 횡단(전 모델) 뷰가 같은 함수를 그대로 재사용한다.
import type { EquipmentReportRow } from "./history-filters";

// 표본 임계(사용자 확정: 숨기지 않고 '참고용' 꼬리표) — 조정 시 여기 한 곳만.
export const SAMPLE_MIN_REPORTS = 10;
export const SAMPLE_MIN_INTERVALS = 3;

const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 개월 환산 = 일/30.44(평균 태양월), 소수 1자리.
export function daysToMonths(days: number): number {
  return Math.round((days / 30.44) * 10) / 10;
}

function issuedOnly(rows: EquipmentReportRow[]): {
  issued: EquipmentReportRow[];
  excludedVoided: number;
} {
  // voided만 명시 집계 — 횡단 뷰가 draft 섞인 입력을 줘도 draft가 '무효 제외'로 오표기되지 않게.
  const issued = rows.filter((r) => r.status === "issued");
  const excludedVoided = rows.filter((r) => r.status === "voided").length;
  return { issued, excludedVoided };
}

// ── 1. 고장 유형 Top 10 ─────────────────────────────────────
export interface FaultStats {
  /** 분모 = 고장 태그 총 개수(리포트 수 아님 — 화면에 명시) */
  totalTags: number;
  reportCount: number;
  top: { fault: string; count: number; pct: number }[];
  restKinds: number;
  restCount: number;
  excludedVoided: number;
}

export function computeFaultStats(rows: EquipmentReportRow[], limit = 10): FaultStats {
  const { issued, excludedVoided } = issuedOnly(rows);
  const counts = new Map<string, number>();
  let totalTags = 0;
  for (const r of issued) {
    for (const f of r.faults) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
      totalTags += 1;
    }
  }
  // 건수 내림차순, 동률은 분류명 ko 정렬
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"),
  );
  const top = sorted.slice(0, limit).map(([fault, count]) => ({
    fault,
    count,
    pct: totalTags > 0 ? Math.round((count / totalTags) * 100) : 0,
  }));
  const rest = sorted.slice(limit);
  return {
    totalTags,
    reportCount: issued.length,
    top,
    restKinds: rest.length,
    restCount: rest.reduce((s, [, c]) => s + c, 0),
    excludedVoided,
  };
}

// ── 2. 평균 고장 주기 ────────────────────────────────────────
export interface IntervalStats {
  intervalCount: number;
  /** 일수(float). 표본 0이면 null — NaN/Infinity를 화면에 내보내지 않는다. */
  meanDays: number | null;
  medianDays: number | null;
  /** 간격 산출 가능 장비 수(발행 2건 이상) */
  deviceCountWithIntervals: number;
  /** 전체 m대 = issued_at 유효한 발행 리포트 기준 distinct 연결 장비 수(미연결 리포트는 별도 병기) */
  linkedDeviceCount: number;
  unlinkedReportCount: number;
  excludedVoided: number;
}

export function computeIntervalStats(rows: EquipmentReportRow[]): IntervalStats {
  const { issued, excludedVoided } = issuedOnly(rows);
  // null 개별장비는 그룹핑 금지 — null끼리 묶이면 서로 다른 장비가 한 대처럼 간격을 만든다.
  const unlinkedReportCount = issued.filter((r) => r.company_equipment_id === null).length;
  const byDevice = new Map<string, number[]>();
  for (const r of issued) {
    if (!r.company_equipment_id || !r.issued_at) continue; // null issued_at 드롭(NaN 방지)
    const t = Date.parse(r.issued_at);
    if (Number.isNaN(t)) continue;
    const arr = byDevice.get(r.company_equipment_id) ?? [];
    arr.push(t);
    byDevice.set(r.company_equipment_id, arr);
  }
  const intervals: number[] = [];
  let deviceCountWithIntervals = 0;
  for (const times of byDevice.values()) {
    if (times.length < 2) continue; // AS 1건뿐인 장비는 분모 제외
    deviceCountWithIntervals += 1;
    times.sort((a, b) => a - b); // 입력 순서 불신 — 그룹 내 ASC 재정렬
    for (let i = 1; i < times.length; i += 1) {
      intervals.push((times[i] - times[i - 1]) / DAY_MS); // 0일 간격(같은 날 재방문) 포함
    }
  }
  return {
    intervalCount: intervals.length,
    meanDays: intervals.length > 0 ? intervals.reduce((s, d) => s + d, 0) / intervals.length : null,
    medianDays: median(intervals),
    deviceCountWithIntervals,
    linkedDeviceCount: byDevice.size,
    unlinkedReportCount,
    excludedVoided,
  };
}

// 짝수 표본 = 가운데 두 값 평균(표준 정의). 빈 배열 = null.
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── 3. 월별 AS 발생 추이 ────────────────────────────────────
export interface MonthlyStats {
  /** 오래된 달 → 현재월. 12칸 고정(0건 월 포함). */
  months: { ym: string; label: string; count: number; current: boolean }[];
  reportCount: number;
  excludedVoided: number;
  /** 300건 절단 fetch였으면 true — 과거 월이 실제보다 적게 보일 수 있음(카드에 표기) */
  truncated: boolean;
}

// KST 달력 월 앵커 — periodCutoffKst(일 앵커) 재사용 금지: 창 시작이 월 중간에 걸린다.
function kstYearMonth(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function computeMonthlyStats(
  rows: EquipmentReportRow[],
  now: Date,
  truncated = false,
): MonthlyStats {
  const { issued, excludedVoided } = issuedOnly(rows);
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const months: MonthlyStats["months"] = [];
  const index = new Map<string, number>();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    index.set(ym, months.length);
    // 라벨은 짧게 — "(진행 중)"은 UI가 current 플래그로 별도 줄 렌더(칼럼 폭 균등 유지).
    months.push({
      ym,
      label: `${d.getUTCMonth() + 1}월`,
      count: 0,
      current: i === 0,
    });
  }
  let reportCount = 0;
  for (const r of issued) {
    if (!r.issued_at) continue;
    const t = Date.parse(r.issued_at);
    if (Number.isNaN(t)) continue;
    const idx = index.get(kstYearMonth(t));
    if (idx === undefined) continue; // 12개월 창 밖
    months[idx].count += 1;
    reportCount += 1;
  }
  return { months, reportCount, excludedVoided, truncated };
}

// ── 4. 유상 / 무상 비율 ─────────────────────────────────────
export const FREE_REASON_UNKNOWN = "사유 미기재";

export interface ChargeStats {
  reportCount: number;
  paidCount: number;
  freeCount: number;
  /** 정수 반올림 — 합계가 99·101%일 수 있음(보정하지 않는다) */
  paidPct: number;
  freePct: number;
  /** 유상 총 청구액(VAT 포함, total 합) — 판정은 charge_type 기준(total=0 유상 가능) */
  paidTotal: number;
  /** 무상 사유별 내역 — DB CHECK enum을 열린 집합으로 취급(하드코딩 매핑 금지), null = 사유 미기재 */
  freeReasons: { reason: string; count: number }[];
  excludedVoided: number;
}

export function computeChargeStats(rows: EquipmentReportRow[]): ChargeStats {
  const { issued, excludedVoided } = issuedOnly(rows);
  const paid = issued.filter((r) => r.charge_type === "paid");
  const free = issued.filter((r) => r.charge_type === "free");
  const reasons = new Map<string, number>();
  for (const r of free) {
    const key = r.free_reason ?? FREE_REASON_UNKNOWN;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const freeReasons = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([reason, count]) => ({ reason, count }));
  const n = issued.length;
  return {
    reportCount: n,
    paidCount: paid.length,
    freeCount: free.length,
    paidPct: n > 0 ? Math.round((paid.length / n) * 100) : 0,
    freePct: n > 0 ? Math.round((free.length / n) * 100) : 0,
    paidTotal: paid.reduce((s, r) => s + r.total, 0),
    freeReasons,
    excludedVoided,
  };
}
