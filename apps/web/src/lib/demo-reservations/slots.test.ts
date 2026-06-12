import { describe, expect, test } from "vitest";
import {
  SLOT_TIMES,
  addMinutesHHmm,
  computeSelection,
  kstRangeIso,
  occupiedSlotSet,
  overlapsRange,
} from "./slots";

describe("SLOT_TIMES — 09:00~17:45 15분 36슬롯", () => {
  test("36개·시작 09:00·끝 17:45", () => {
    expect(SLOT_TIMES).toHaveLength(36);
    expect(SLOT_TIMES[0]).toBe("09:00");
    expect(SLOT_TIMES[35]).toBe("17:45");
  });
});

describe("addMinutesHHmm", () => {
  test("13:00 + 90분 = 14:30", () => {
    expect(addMinutesHHmm("13:00", 90)).toBe("14:30");
  });
  test("17:45 + 30분 = 18:15 (운영시간 초과도 산술은 정직)", () => {
    expect(addMinutesHHmm("17:45", 30)).toBe("18:15");
  });
});

describe("kstRangeIso — KST 오프셋 명시 ISO 범위", () => {
  test("날짜+시작+소요 → +09:00 ISO 쌍", () => {
    expect(kstRangeIso("2026-07-01", "13:00", 90)).toEqual({
      startIso: "2026-07-01T13:00:00+09:00",
      endIso: "2026-07-01T14:30:00+09:00",
    });
  });
});

describe("overlapsRange — 반개구간 [start,end)", () => {
  test("13:00–14:30 vs 14:00–15:30 → 겹침", () => {
    expect(overlapsRange("13:00", "14:30", "14:00", "15:30")).toBe(true);
  });
  test("13:00–14:00 vs 14:00–15:00 → 경계 접촉은 겹침 아님", () => {
    expect(overlapsRange("13:00", "14:00", "14:00", "15:00")).toBe(false);
  });
});

const EXISTING = [{ start: "14:00", end: "15:30" }];

describe("computeSelection — 선택 범위·충돌·운영시간", () => {
  test("스펙 핵심 케이스: 13:00 + 90분 vs 기존 14:00–15:30 → 충돌", () => {
    const sel = computeSelection("13:00", 90, EXISTING);
    expect(sel.conflict).toBe(true);
    expect(sel.slots).toEqual(["13:00", "13:15", "13:30", "13:45", "14:00", "14:15"]);
  });

  test("10:00 + 90분 → 충돌 없음", () => {
    const sel = computeSelection("10:00", 90, EXISTING);
    expect(sel.conflict).toBe(false);
    expect(sel.exceedsClose).toBe(false);
  });

  test("17:30 + 60분 → 18:00 초과(exceedsClose)", () => {
    const sel = computeSelection("17:30", 60, []);
    expect(sel.exceedsClose).toBe(true);
  });

  test("17:00 + 60분 → 정확히 18:00 종료는 허용", () => {
    const sel = computeSelection("17:00", 60, []);
    expect(sel.exceedsClose).toBe(false);
  });

  test("12:30 + 90분(종료 14:00) vs 기존 14:00 시작 → 경계 접촉 비충돌", () => {
    const sel = computeSelection("12:30", 90, EXISTING);
    expect(sel.conflict).toBe(false);
  });
});

describe("occupiedSlotSet — 기존 예약이 걸친 15분 슬롯 전부", () => {
  test("14:00–15:30 → 14:00~15:15 6슬롯 점유(15:30은 종료 경계라 비점유)", () => {
    const set = occupiedSlotSet(EXISTING);
    expect([...set].sort()).toEqual(["14:00", "14:15", "14:30", "14:45", "15:00", "15:15"]);
  });
});
