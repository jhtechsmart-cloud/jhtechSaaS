import { describe, expect, it } from "vitest";
import {
  filterReports,
  parseHistoryFilters,
  periodCutoffKst,
  serializeHistoryFilters,
  type EquipmentReportRow,
  type HistoryFilters,
} from "./history-filters";

const DEFAULTS: HistoryFilters = {
  faults: [],
  period: "all",
  charge: "all",
  customer: "",
  voided: false,
};

function row(over: Partial<EquipmentReportRow>): EquipmentReportRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    seq_no: "SR-20260701-00001",
    status: "issued",
    customer_name: "OO상사",
    device_serial: "SN-001",
    faults: ["헤드 노즐 막힘"],
    action_text: "노즐 세척",
    parts: [],
    charge_type: "free",
    total: 0,
    pdf_url: null,
    void_reason: null,
    issued_at: "2026-07-01T03:00:00.000Z",
    ...over,
  };
}

describe("parseHistoryFilters — URL → 상태(잘못된 값은 기본값)", () => {
  it("빈 쿼리는 기본값", () => {
    expect(parseHistoryFilters(new URLSearchParams())).toEqual(DEFAULTS);
  });

  it("fault 반복 파라미터를 배열로(중복 제거)", () => {
    const p = new URLSearchParams("fault=a&fault=b&fault=a");
    expect(parseHistoryFilters(p).faults).toEqual(["a", "b"]);
  });

  it("period·charge 허용값 외는 기본값으로", () => {
    expect(parseHistoryFilters(new URLSearchParams("period=1y")).period).toBe("1y");
    expect(parseHistoryFilters(new URLSearchParams("period=99y")).period).toBe("all");
    expect(parseHistoryFilters(new URLSearchParams("charge=free")).charge).toBe("free");
    expect(parseHistoryFilters(new URLSearchParams("charge=paid")).charge).toBe("paid");
    expect(parseHistoryFilters(new URLSearchParams("charge=nope")).charge).toBe("all");
  });

  it("voided는 '1'만 true", () => {
    expect(parseHistoryFilters(new URLSearchParams("voided=1")).voided).toBe(true);
    expect(parseHistoryFilters(new URLSearchParams("voided=true")).voided).toBe(false);
  });

  it("customer는 trim", () => {
    expect(parseHistoryFilters(new URLSearchParams("customer=%20OO%20")).customer).toBe("OO");
  });
});

describe("serializeHistoryFilters — 기본값 생략 왕복", () => {
  it("기본값은 빈 쿼리", () => {
    expect(serializeHistoryFilters(DEFAULTS).toString()).toBe("");
  });

  it("왕복 보존", () => {
    const f: HistoryFilters = {
      faults: ["a", "b"],
      period: "6m",
      charge: "paid",
      customer: "OO",
      voided: true,
    };
    expect(parseHistoryFilters(serializeHistoryFilters(f))).toEqual(f);
  });
});

describe("periodCutoffKst — KST(Asia/Seoul) 달력 기준 경계", () => {
  it("all은 null", () => {
    expect(periodCutoffKst("all", new Date("2026-07-21T00:00:00Z"))).toBeNull();
  });

  it("KST 자정 직후(UTC 15:00 = KST 다음날 00:00)는 KST 날짜 기준으로 계산", () => {
    // UTC 2026-07-20 15:30 = KST 2026-07-21 00:30 → 1y 컷오프 = KST 2025-07-21 00:00
    const cut = periodCutoffKst("1y", new Date("2026-07-20T15:30:00Z"));
    expect(cut).toBe("2025-07-20T15:00:00.000Z"); // = KST 2025-07-21 00:00
  });

  it("6m 월말은 대상 월 말일로 클램프(8/31 → 2/28)", () => {
    // KST 2026-08-31 → 6m 전 = 2026-02-31(없음) → 2026-02-28 00:00 KST
    const cut = periodCutoffKst("6m", new Date("2026-08-31T03:00:00Z"));
    expect(cut).toBe("2026-02-27T15:00:00.000Z"); // = KST 2026-02-28 00:00
  });

  it("윤년 2/29 → 1y 전 2/28 클램프", () => {
    // KST 2028-02-29 → 1y 전 = 2027-02-29(없음) → 2027-02-28 00:00 KST
    const cut = periodCutoffKst("1y", new Date("2028-02-29T03:00:00Z"));
    expect(cut).toBe("2027-02-27T15:00:00.000Z");
  });
});

describe("filterReports — 조합 필터", () => {
  const now = new Date("2026-07-21T03:00:00Z");
  const rows: EquipmentReportRow[] = [
    row({ id: "00000000-0000-4000-8000-00000000000a" }),
    row({
      id: "00000000-0000-4000-8000-00000000000b",
      status: "voided",
      void_reason: "오기재",
    }),
    row({
      id: "00000000-0000-4000-8000-00000000000c",
      charge_type: "paid",
      total: 110000,
      faults: ["UV LED 출력 저하", "경화 불량(끈적임·미경화)"],
      customer_name: "재현상사",
      issued_at: "2025-01-10T03:00:00.000Z",
    }),
  ];

  it("기본 = 무효 제외", () => {
    expect(filterReports(rows, DEFAULTS, now).map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000c",
    ]);
  });

  it("voided=true면 무효 포함", () => {
    expect(filterReports(rows, { ...DEFAULTS, voided: true }, now)).toHaveLength(3);
  });

  it("fault 다중 = OR", () => {
    const got = filterReports(rows, { ...DEFAULTS, faults: ["UV LED 출력 저하", "없는분류"] }, now);
    expect(got.map((r) => r.id)).toEqual(["00000000-0000-4000-8000-00000000000c"]);
  });

  it("charge는 charge_type 컬럼 기준(총액 아님)", () => {
    expect(filterReports(rows, { ...DEFAULTS, charge: "free" }, now)).toHaveLength(1);
    expect(filterReports(rows, { ...DEFAULTS, charge: "paid" }, now)).toHaveLength(1);
  });

  it("customer는 대소문자 무시 부분 일치", () => {
    expect(filterReports(rows, { ...DEFAULTS, customer: "재현" }, now)).toHaveLength(1);
    expect(filterReports(rows, { ...DEFAULTS, customer: "oo상사" }, now)).toHaveLength(1);
  });

  it("period=1y는 KST 컷오프 이전 발행분 제외", () => {
    const got = filterReports(rows, { ...DEFAULTS, period: "1y" }, now);
    expect(got.map((r) => r.id)).toEqual(["00000000-0000-4000-8000-00000000000a"]);
  });

  it("issued_at null(방어)은 기간 필터에서 제외", () => {
    const noDate = [row({ id: "00000000-0000-4000-8000-00000000000d", issued_at: null })];
    expect(filterReports(noDate, { ...DEFAULTS, period: "1y" }, now)).toHaveLength(0);
    expect(filterReports(noDate, DEFAULTS, now)).toHaveLength(1);
  });
});
