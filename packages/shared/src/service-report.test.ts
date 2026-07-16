import { describe, expect, test } from "vitest";
import {
  FAULT_GROUPS,
  FREE_REASONS,
  SERVICE_REPORT_LIMITS,
  calculateServiceCharge,
  judgeWarranty,
  sortFaultGroupsForKind,
} from "./service-report";

describe("judgeWarranty — 구매(설치)일 기준 12개월 보증 판정", () => {
  test("구매일 없음 → null(판정 불가, 화면은 기본 유상)", () => {
    expect(judgeWarranty(null, new Date("2026-07-16"))).toBeNull();
    expect(judgeWarranty(undefined, new Date("2026-07-16"))).toBeNull();
    expect(judgeWarranty("", new Date("2026-07-16"))).toBeNull();
  });

  test("12개월 이내 → 무상 대상 + 경과 개월", () => {
    const w = judgeWarranty("2025-10-16", new Date("2026-07-16"));
    expect(w).toEqual({ months: 9, inWarranty: true });
  });

  test("경계: 정확히 12개월 경과 시점부터 유상", () => {
    // 2025-07-16 구매 → 2026-07-15는 11개월(무상), 2026-07-16은 12개월(유상)
    expect(judgeWarranty("2025-07-16", new Date("2026-07-15"))).toEqual({
      months: 11,
      inWarranty: true,
    });
    expect(judgeWarranty("2025-07-16", new Date("2026-07-16"))).toEqual({
      months: 12,
      inWarranty: false,
    });
  });

  test("일 미도래 시 개월 내림(같은 달 계산 아님)", () => {
    // 2025-06-20 구매 → 2026-07-16: 12개월+26일 → 12개월(유상 경계 넘음)
    expect(judgeWarranty("2025-06-20", new Date("2026-07-16"))?.months).toBe(12);
    // 2025-08-20 구매 → 2026-07-16: 10개월+26일 → 10개월
    expect(judgeWarranty("2025-08-20", new Date("2026-07-16"))?.months).toBe(10);
  });
});

describe("calculateServiceCharge — 청구 계산(견적 엔진과 동일 round 규칙)", () => {
  test("유상: 출장비+시간외+부품, VAT=round(합*0.1)", () => {
    const r = calculateServiceCharge({
      chargeType: "paid",
      visitFee: 90000,
      overtimeFee: 30000,
      parts: [
        { name: "SSR 모듈", qty: 2, price: 15000 },
        { name: "퓨즈", qty: 1, price: 2500 },
      ],
    });
    expect(r.partsTotal).toBe(32500);
    expect(r.vat).toBe(Math.round(152500 * 0.1));
    expect(r.total).toBe(152500 + r.vat);
  });

  test("VAT 반올림 경계(1원 단위) — Math.round와 일치", () => {
    const r = calculateServiceCharge({
      chargeType: "paid",
      visitFee: 5,
      overtimeFee: 0,
      parts: [],
    });
    expect(r.vat).toBe(1); // round(0.5)=1 (half-up, SQL round와 동일 양수 동작)
  });

  test("무상: 전액 0 (부품 있어도)", () => {
    const r = calculateServiceCharge({
      chargeType: "free",
      visitFee: 90000,
      overtimeFee: 10000,
      parts: [{ name: "부품", qty: 1, price: 99999 }],
    });
    expect(r).toEqual({ partsTotal: 0, supply: 0, vat: 0, total: 0 });
  });

  test("음수·비정상 수치는 0으로 클램프", () => {
    const r = calculateServiceCharge({
      chargeType: "paid",
      visitFee: -100,
      overtimeFee: Number.NaN,
      parts: [{ name: "x", qty: -1, price: 100 }],
    });
    expect(r.total).toBe(0);
  });
});

describe("sortFaultGroupsForKind — 장비 대분류로 관련 그룹 우선 정렬", () => {
  test("프린터: printer 그룹 → common → cutter 순", () => {
    const scopes = sortFaultGroupsForKind("printer").map((g) => g.scope);
    const firstCutter = scopes.indexOf("cutter");
    const lastPrinter = scopes.lastIndexOf("printer");
    const lastCommon = scopes.lastIndexOf("common");
    expect(lastPrinter).toBeLessThan(scopes.indexOf("common"));
    expect(lastCommon).toBeLessThan(firstCutter);
  });

  test("커팅기: cutter 그룹이 앞", () => {
    const scopes = sortFaultGroupsForKind("cutter").map((g) => g.scope);
    expect(scopes[0]).toBe("cutter");
  });

  test("미상(null): 원 순서 유지, 그룹 유실 없음", () => {
    expect(sortFaultGroupsForKind(null)).toHaveLength(FAULT_GROUPS.length);
  });
});

describe("상수 무결성", () => {
  test("고장분류: 8그룹, 항목 중복 없음", () => {
    expect(FAULT_GROUPS).toHaveLength(8);
    const all = FAULT_GROUPS.flatMap((g) => g.items);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(50);
  });

  test("무상 사유 4종", () => {
    expect(FREE_REASONS).toEqual(["보증기간 내", "재방문 (동일 증상)", "영업 판단", "계약 포함"]);
  });

  test("입력 캡 상수", () => {
    expect(SERVICE_REPORT_LIMITS.maxPhotosPerSlot).toBe(6);
    expect(SERVICE_REPORT_LIMITS.maxFaults).toBeGreaterThan(0);
    expect(SERVICE_REPORT_LIMITS.maxParts).toBeGreaterThan(0);
  });
});
