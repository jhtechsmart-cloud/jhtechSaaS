import { describe, expect, it } from "vitest";
import type { EquipmentReportRow } from "./history-filters";
import {
  SAMPLE_MIN_INTERVALS,
  SAMPLE_MIN_REPORTS,
  computeChargeStats,
  computeFaultStats,
  computeIntervalStats,
  computeMonthlyStats,
  daysToMonths,
} from "./service-stats";

let seq = 0;
function row(over: Partial<EquipmentReportRow>): EquipmentReportRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq_no: `SR-20260701-${String(seq).padStart(5, "0")}`,
    status: "issued",
    customer_name: "OO상사",
    device_serial: null,
    faults: [],
    action_text: "",
    parts: [],
    charge_type: "free",
    total: 0,
    pdf_url: null,
    void_reason: null,
    issued_at: "2026-07-01T03:00:00.000Z",
    company_equipment_id: "00000000-0000-4000-8000-0000000000d1",
    free_reason: "보증기간 내",
    ...over,
  };
}

const NOW = new Date("2026-07-21T03:00:00Z"); // KST 2026-07-21 12:00

describe("computeFaultStats — 고장 Top10", () => {
  it("건수 내림차순·동률 ko 정렬·분모=태그 총수", () => {
    const rows = [
      row({ faults: ["나사 풀림", "가나 고장"] }),
      row({ faults: ["나사 풀림"] }),
      row({ faults: ["다리 파손"] }),
    ];
    const s = computeFaultStats(rows);
    expect(s.totalTags).toBe(4);
    expect(s.top[0]).toEqual({ fault: "나사 풀림", count: 2, pct: 50 });
    // 동률 1건끼리는 ko 정렬: 가나 < 다리
    expect(s.top.slice(1).map((t) => t.fault)).toEqual(["가나 고장", "다리 파손"]);
  });

  it("11위 이하는 '그 외 n종'으로 합산", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ faults: [`고장${String.fromCharCode(44032 + i)}`] }));
    // 1위를 만들려고 첫 분류 1건 추가
    rows.push(row({ faults: ["고장가"] }));
    const s = computeFaultStats(rows);
    expect(s.top).toHaveLength(10);
    expect(s.restKinds).toBe(2);
    expect(s.restCount).toBe(2);
  });

  it("faults 빈 리포트는 태그 분모에 안 들어간다", () => {
    const s = computeFaultStats([row({ faults: [] }), row({ faults: ["a"] })]);
    expect(s.totalTags).toBe(1);
    expect(s.reportCount).toBe(2);
  });

  it("voided는 내부에서 제외 + 제외 건수 반환", () => {
    const s = computeFaultStats([row({ faults: ["a"] }), row({ status: "voided", faults: ["a", "b"] })]);
    expect(s.totalTags).toBe(1);
    expect(s.excludedVoided).toBe(1);
  });
});

describe("computeIntervalStats — 평균 고장 주기", () => {
  const D1 = "00000000-0000-4000-8000-0000000000e1";
  const D2 = "00000000-0000-4000-8000-0000000000e2";

  it("다중 장비의 간격을 모아 평균·중앙값(스펙 예제)", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: "2025-01-10T03:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2025-08-02T03:00:00Z" }), // 204일
      row({ company_equipment_id: D1, issued_at: "2026-03-15T03:00:00Z" }), // 225일
      row({ company_equipment_id: D2, issued_at: "2026-02-01T03:00:00Z" }),
      row({ company_equipment_id: D2, issued_at: "2026-06-20T03:00:00Z" }), // 139일
    ];
    const s = computeIntervalStats(rows);
    expect(s.intervalCount).toBe(3);
    expect(s.meanDays).toBeCloseTo((204 + 225 + 139) / 3, 5);
    expect(s.medianDays).toBeCloseTo(204, 5);
    expect(s.deviceCountWithIntervals).toBe(2);
    expect(s.linkedDeviceCount).toBe(2);
  });

  it("입력 순서를 신뢰하지 않는다(미정렬·DESC 입력도 동일 결과)", () => {
    const asc = [
      row({ company_equipment_id: D1, issued_at: "2025-01-10T03:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2025-01-20T03:00:00Z" }),
    ];
    const desc = [...asc].reverse();
    expect(computeIntervalStats(desc).meanDays).toBeCloseTo(10, 5);
    expect(computeIntervalStats(asc).meanDays).toBeCloseTo(10, 5);
  });

  it("AS 1건뿐인 장비는 분모 제외, null 장비끼리 간격을 만들지 않는다", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: "2026-01-01T03:00:00Z" }),
      row({ company_equipment_id: null, issued_at: "2026-02-01T03:00:00Z" }),
      row({ company_equipment_id: null, issued_at: "2026-03-01T03:00:00Z" }),
    ];
    const s = computeIntervalStats(rows);
    expect(s.intervalCount).toBe(0);
    expect(s.meanDays).toBeNull();
    expect(s.medianDays).toBeNull();
    expect(s.unlinkedReportCount).toBe(2);
    expect(s.linkedDeviceCount).toBe(1);
    expect(s.deviceCountWithIntervals).toBe(0);
  });

  it("voided가 사이에 껴도 issued끼리만 연속으로 계산", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: "2026-01-01T03:00:00Z" }),
      row({ company_equipment_id: D1, status: "voided", issued_at: "2026-02-01T03:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2026-03-02T03:00:00Z" }),
    ];
    const s = computeIntervalStats(rows);
    expect(s.intervalCount).toBe(1);
    expect(s.meanDays).toBeCloseTo(60, 5); // 1/1→3/2 = 60일 (voided 건너뜀)
    expect(s.excludedVoided).toBe(1);
  });

  it("0일 간격(같은 날 재방문)은 포함", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: "2026-01-01T03:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2026-01-01T05:00:00Z" }),
    ];
    const s = computeIntervalStats(rows);
    expect(s.intervalCount).toBe(1);
    expect(s.meanDays).toBeGreaterThanOrEqual(0);
    expect(s.meanDays).toBeLessThan(1);
  });

  it("null issued_at 행은 드롭(NaN 미오염)", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: null }),
      row({ company_equipment_id: D1, issued_at: "2026-01-01T03:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2026-01-11T03:00:00Z" }),
    ];
    const s = computeIntervalStats(rows);
    expect(s.intervalCount).toBe(1);
    expect(Number.isFinite(s.meanDays ?? NaN)).toBe(true);
  });

  it("짝수 표본 중앙값 = 가운데 두 값 평균", () => {
    const rows = [
      row({ company_equipment_id: D1, issued_at: "2026-01-01T00:00:00Z" }),
      row({ company_equipment_id: D1, issued_at: "2026-01-11T00:00:00Z" }), // 10
      row({ company_equipment_id: D2, issued_at: "2026-01-01T00:00:00Z" }),
      row({ company_equipment_id: D2, issued_at: "2026-01-31T00:00:00Z" }), // 30
    ];
    expect(computeIntervalStats(rows).medianDays).toBeCloseTo(20, 5);
  });

  it("표본 0이면 null(NaN·Infinity 노출 없음)", () => {
    const s = computeIntervalStats([]);
    expect(s.meanDays).toBeNull();
    expect(s.medianDays).toBeNull();
    expect(s.intervalCount).toBe(0);
  });
});

describe("daysToMonths — 환산 규칙(30.44·소수 1자리)", () => {
  it("189일 ≈ 6.2개월(189/30.44=6.209…)", () => {
    expect(daysToMonths(189)).toBe(6.2);
  });
  it("204일 ≈ 6.7개월", () => {
    expect(daysToMonths(204)).toBe(6.7);
  });
});

describe("computeMonthlyStats — 최근 12개월(KST)", () => {
  it("12칸 빠짐없이(0건 월 포함)·현재월 current 플래그", () => {
    const s = computeMonthlyStats([row({ issued_at: "2026-07-01T03:00:00Z" })], NOW);
    expect(s.months).toHaveLength(12);
    expect(s.months[0].ym).toBe("2025-08");
    expect(s.months[11].ym).toBe("2026-07");
    expect(s.months[11].current).toBe(true);
    expect(s.months[11].count).toBe(1);
    expect(s.months.filter((m) => m.count === 0)).toHaveLength(11);
  });

  it("KST 자정 경계 — UTC 6/30 15:30 = KST 7/1 → 7월 버킷(TZ 비의존)", () => {
    const s = computeMonthlyStats([row({ issued_at: "2026-06-30T15:30:00Z" })], NOW);
    expect(s.months.find((m) => m.ym === "2026-07")?.count).toBe(1);
    expect(s.months.find((m) => m.ym === "2026-06")?.count).toBe(0);
  });

  it("KST 자정 직전 — UTC 6/30 14:30 = KST 6/30 23:30 → 6월 버킷", () => {
    const s = computeMonthlyStats([row({ issued_at: "2026-06-30T14:30:00Z" })], NOW);
    expect(s.months.find((m) => m.ym === "2026-06")?.count).toBe(1);
  });

  it("연말연시 경계 — 창이 연도를 걸친다", () => {
    const dec = new Date("2026-01-10T03:00:00Z");
    const s = computeMonthlyStats([row({ issued_at: "2025-02-15T03:00:00Z" })], dec);
    expect(s.months[0].ym).toBe("2025-02");
    expect(s.months[0].count).toBe(1);
    expect(s.months[11].ym).toBe("2026-01");
  });

  it("창 밖(13개월 전)·voided·null issued_at 제외", () => {
    const s = computeMonthlyStats(
      [
        row({ issued_at: "2025-06-15T03:00:00Z" }), // 창 밖
        row({ status: "voided", issued_at: "2026-07-01T03:00:00Z" }),
        row({ issued_at: null }),
      ],
      NOW,
    );
    expect(s.months.every((m) => m.count === 0)).toBe(true);
    expect(s.excludedVoided).toBe(1);
  });

  it("truncated 플래그 패스스루", () => {
    expect(computeMonthlyStats([], NOW, true).truncated).toBe(true);
    expect(computeMonthlyStats([], NOW).truncated).toBe(false);
  });
});

describe("computeChargeStats — 유상/무상", () => {
  it("charge_type 기준(총액 0인 유상도 유상)·정수 % 반올림·VAT 포함 합계", () => {
    const rows = [
      row({ charge_type: "paid", total: 110000, free_reason: null }),
      row({ charge_type: "paid", total: 0, free_reason: null }),
      row({ charge_type: "free", total: 0, free_reason: "보증기간 내" }),
    ];
    const s = computeChargeStats(rows);
    expect(s.paidCount).toBe(2);
    expect(s.freeCount).toBe(1);
    expect(s.paidPct).toBe(67); // 66.66 → 67, 합계 보정 없음
    expect(s.freePct).toBe(33);
    expect(s.paidTotal).toBe(110000);
  });

  it("무상 사유별 내역 — 열린 집합 + null = 사유 미기재", () => {
    const rows = [
      row({ charge_type: "free", free_reason: "보증기간 내" }),
      row({ charge_type: "free", free_reason: "보증기간 내" }),
      row({ charge_type: "free", free_reason: null }),
      row({ charge_type: "free", free_reason: "미래에 추가된 사유" }),
    ];
    const s = computeChargeStats(rows);
    expect(s.freeReasons).toEqual([
      { reason: "보증기간 내", count: 2 },
      { reason: "미래에 추가된 사유", count: 1 },
      { reason: "사유 미기재", count: 1 },
    ]);
  });

  it("voided 제외 + 표본 0 = NaN 없음", () => {
    const s = computeChargeStats([row({ status: "voided" })]);
    expect(s.reportCount).toBe(0);
    expect(s.paidPct).toBe(0);
    expect(s.excludedVoided).toBe(1);
  });
});

describe("표본 임계 상수", () => {
  it("10건/3간격", () => {
    expect(SAMPLE_MIN_REPORTS).toBe(10);
    expect(SAMPLE_MIN_INTERVALS).toBe(3);
  });
});
