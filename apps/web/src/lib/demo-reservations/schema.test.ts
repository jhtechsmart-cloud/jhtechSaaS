import { describe, expect, test } from "vitest";
import { createReservationSchema } from "./schema";

const VALID = {
  companyId: null,
  customerName: "재현테크",
  equipmentId: "fa1f4df4-0000-4000-8000-000000000001",
  date: "2026-07-01",
  startTime: "10:00",
  durationMin: 90,
};

describe("createReservationSchema", () => {
  test("정상 입력 통과", () => {
    expect(createReservationSchema.safeParse(VALID).success).toBe(true);
  });

  test("15분 단위 아닌 시작(10:07) 거부 — 서버 직접 호출 차단", () => {
    const r = createReservationSchema.safeParse({ ...VALID, startTime: "10:07" });
    expect(r.success).toBe(false);
  });

  test("운영시간 이전(08:45) 거부", () => {
    const r = createReservationSchema.safeParse({ ...VALID, startTime: "08:45" });
    expect(r.success).toBe(false);
  });

  test("종료가 18:00 초과(17:30+60분) 거부", () => {
    const r = createReservationSchema.safeParse({
      ...VALID,
      startTime: "17:30",
      durationMin: 60,
    });
    expect(r.success).toBe(false);
  });

  test("정확히 18:00 종료(17:00+60분)는 허용", () => {
    const r = createReservationSchema.safeParse({
      ...VALID,
      startTime: "17:00",
      durationMin: 60,
    });
    expect(r.success).toBe(true);
  });

  test("허용 외 소요시간(45분) 거부", () => {
    const r = createReservationSchema.safeParse({ ...VALID, durationMin: 45 });
    expect(r.success).toBe(false);
  });

  test("고객명 공백 거부·장비 id 형식 거부", () => {
    expect(
      createReservationSchema.safeParse({ ...VALID, customerName: "  " }).success,
    ).toBe(false);
    expect(
      createReservationSchema.safeParse({ ...VALID, equipmentId: "abc" }).success,
    ).toBe(false);
  });
});
