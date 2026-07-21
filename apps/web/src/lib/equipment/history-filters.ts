// #243 장비 상세 AS 이력 탭 — 필터 상태(URL 단일 원본) 순수 로직.
// URL 스키마: ?tab=history&fault=…(반복, OR)&period=all|1y|6m&charge=all|paid|free&customer=…&voided=1
// 기간 경계는 KST(Asia/Seoul) 달력 기준(채번·상태 전이와 동일 관행).

export type HistoryPeriod = "all" | "1y" | "6m";
export type HistoryCharge = "all" | "paid" | "free";

export interface HistoryFilters {
  faults: string[];
  period: HistoryPeriod;
  charge: HistoryCharge;
  customer: string;
  voided: boolean;
}

// 이력 행 — AdminReportRow 서브셋 + 확장에 필요한 필드(faults·parts·serial·전문).
export interface EquipmentReportRow {
  id: string;
  seq_no: string;
  status: "issued" | "voided";
  customer_name: string;
  device_serial: string | null;
  faults: string[];
  action_text: string;
  parts: { name: string; qty: number; price: number }[];
  charge_type: "paid" | "free";
  total: number;
  pdf_url: string | null;
  void_reason: string | null;
  issued_at: string | null;
}

const PERIODS: readonly HistoryPeriod[] = ["all", "1y", "6m"];
const CHARGES: readonly HistoryCharge[] = ["all", "paid", "free"];

export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const period = params.get("period") as HistoryPeriod | null;
  const charge = params.get("charge") as HistoryCharge | null;
  return {
    faults: [...new Set(params.getAll("fault").filter((f) => f.trim() !== ""))],
    period: period && PERIODS.includes(period) ? period : "all",
    charge: charge && CHARGES.includes(charge) ? charge : "all",
    customer: (params.get("customer") ?? "").trim(),
    voided: params.get("voided") === "1",
  };
}

// 기본값은 생략 — 공유 링크를 짧게 유지.
export function serializeHistoryFilters(f: HistoryFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const fault of f.faults) p.append("fault", fault);
  if (f.period !== "all") p.set("period", f.period);
  if (f.charge !== "all") p.set("charge", f.charge);
  if (f.customer) p.set("customer", f.customer);
  if (f.voided) p.set("voided", "1");
  return p;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// KST 달력 기준 컷오프(해당 KST 날짜 00:00의 UTC 시각, ISO). 월말은 대상 월 말일로 클램프.
export function periodCutoffKst(period: HistoryPeriod, now: Date): string | null {
  if (period === "all") return null;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const back = period === "1y" ? 12 : 6;
  const targetMonthStart = new Date(Date.UTC(y, m - back, 1));
  const ty = targetMonthStart.getUTCFullYear();
  const tm = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const cutoffUtcMs = Date.UTC(ty, tm, Math.min(d, lastDay)) - KST_OFFSET_MS;
  return new Date(cutoffUtcMs).toISOString();
}

export function filterReports(
  rows: EquipmentReportRow[],
  f: HistoryFilters,
  now: Date,
): EquipmentReportRow[] {
  const cutoff = periodCutoffKst(f.period, now);
  const customer = f.customer.toLocaleLowerCase();
  return rows.filter((r) => {
    if (!f.voided && r.status === "voided") return false;
    if (f.faults.length > 0 && !r.faults.some((x) => f.faults.includes(x))) return false;
    if (f.charge !== "all" && r.charge_type !== f.charge) return false;
    if (customer && !r.customer_name.toLocaleLowerCase().includes(customer)) return false;
    if (cutoff) {
      if (!r.issued_at) return false; // 발행 시각 없는 행은 기간 필터에서 제외(방어)
      // 문자열 비교 금지 — DB 직렬화(+00:00·마이크로초 자릿수 가변)와 ISO Z 표기가 섞이면
      // 경계 초에서 문자 순서로 오판한다. epoch 비교로.
      if (Date.parse(r.issued_at) < Date.parse(cutoff)) return false;
    }
    return true;
  });
}
