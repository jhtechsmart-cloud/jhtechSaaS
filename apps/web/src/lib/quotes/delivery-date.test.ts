import { describe, expect, test } from "vitest";
import { formatDateMask, parseDeliveryDate } from "./delivery-date";

// 납품일 마스크 입력 — 숫자 연속 입력을 YYYY-MM-DD로 점진 포맷 + 검증. 순수 로직.
describe("formatDateMask", () => {
  test("숫자를 치는 대로 대시 자동 삽입", () => {
    expect(formatDateMask("2")).toBe("2");
    expect(formatDateMask("2026")).toBe("2026");
    expect(formatDateMask("20260")).toBe("2026-0");
    expect(formatDateMask("202608")).toBe("2026-08");
    expect(formatDateMask("2026081")).toBe("2026-08-1");
    expect(formatDateMask("20260815")).toBe("2026-08-15");
  });

  test("숫자 아닌 문자 제거(기존 대시·공백 포함) → 재포맷", () => {
    expect(formatDateMask("2026-08-15")).toBe("2026-08-15"); // 라운드트립(초기값 주입)
    expect(formatDateMask("2026.08.15")).toBe("2026-08-15");
    expect(formatDateMask("abc2026")).toBe("2026");
  });

  test("8자리 초과 입력은 잘라냄", () => {
    expect(formatDateMask("2026081599")).toBe("2026-08-15");
  });

  test("빈 입력은 빈 문자열", () => {
    expect(formatDateMask("")).toBe("");
  });
});

describe("parseDeliveryDate", () => {
  test("완성된 유효 날짜 → iso 반환, 에러 없음", () => {
    expect(parseDeliveryDate("2026-08-15")).toEqual({ iso: "2026-08-15", error: null });
  });

  test("빈 값 → iso null·에러 없음(날짜 제거 허용)", () => {
    expect(parseDeliveryDate("")).toEqual({ iso: null, error: null });
  });

  test("미완성(8자리 미만) → 에러", () => {
    expect(parseDeliveryDate("2026-08").iso).toBeNull();
    expect(parseDeliveryDate("2026-08").error).toBeTruthy();
  });

  test("연도 4자리 미만(0~999) → 에러 (JS Date 0~99 매핑·Postgres 연도0 거부 방지)", () => {
    expect(parseDeliveryDate("0000-01-01").iso).toBeNull();
    expect(parseDeliveryDate("0026-08-15").iso).toBeNull(); // 0026 = 오타, 거부
    expect(parseDeliveryDate("0026-08-15").error).toBeTruthy();
  });

  test("월 범위 밖 → 에러", () => {
    expect(parseDeliveryDate("2026-13-01").iso).toBeNull();
    expect(parseDeliveryDate("2026-00-01").iso).toBeNull();
  });

  test("일 범위 밖(월별 일수) → 에러", () => {
    expect(parseDeliveryDate("2026-02-30").iso).toBeNull(); // 2월 30일 없음
    expect(parseDeliveryDate("2026-04-31").iso).toBeNull(); // 4월 31일 없음
  });

  test("윤년 2월 29일 처리", () => {
    expect(parseDeliveryDate("2028-02-29")).toEqual({ iso: "2028-02-29", error: null }); // 2028 윤년
    expect(parseDeliveryDate("2026-02-29").iso).toBeNull(); // 2026 평년
  });
});
