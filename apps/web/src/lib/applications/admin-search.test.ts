import { describe, expect, it, test } from "vitest";
import { buildSearchOr, splitOverflow, normalizeBizNo, dateGroupOf } from "./admin-search";

describe("buildSearchOr — PostgREST .or 안전 생성", () => {
  test("빈 검색어는 null(필터 없음)", () => {
    expect(buildSearchOr("")).toBeNull();
    expect(buildSearchOr("   ")).toBeNull();
  });

  test("정상 검색어는 company·seq_no·biz_no ilike OR", () => {
    expect(buildSearchOr("재현")).toBe("company.ilike.%재현%,seq_no.ilike.%재현%,biz_no.ilike.%재현%");
  });

  test("메타문자(,()%_*\\)는 제거 — 필터/와일드카드 주입 차단", () => {
    expect(buildSearchOr("a,b(c)%_*\\d")).toBe("company.ilike.%abcd%,seq_no.ilike.%abcd%,biz_no.ilike.%abcd%");
  });

  test("REQ- 하이픈은 보존(접수번호 검색)", () => {
    expect(buildSearchOr("REQ-2026")).toBe("company.ilike.%REQ-2026%,seq_no.ilike.%REQ-2026%,biz_no.ilike.%REQ-2026%");
  });
});

describe("normalizeBizNo — 숫자만 추출", () => {
  test("하이픈 제거", () => {
    expect(normalizeBizNo("123-45-67890")).toBe("1234567890");
  });
  test("이미 숫자면 그대로", () => {
    expect(normalizeBizNo("1234567890")).toBe("1234567890");
  });
  test("null/undefined/공백 → 빈 문자열", () => {
    expect(normalizeBizNo(null)).toBe("");
    expect(normalizeBizNo(undefined)).toBe("");
    expect(normalizeBizNo("  ")).toBe("");
  });
});

describe("buildSearchOr — biz_no 포함", () => {
  it("company·seq_no·biz_no 세 컬럼 ilike OR을 만든다", () => {
    expect(buildSearchOr("대성")).toBe(
      "company.ilike.%대성%,seq_no.ilike.%대성%,biz_no.ilike.%대성%",
    );
  });
  it("메타문자 제거는 유지", () => {
    expect(buildSearchOr("a%b)c")).toBe(
      "company.ilike.%abc%,seq_no.ilike.%abc%,biz_no.ilike.%abc%",
    );
  });
  it("공백만이면 null", () => {
    expect(buildSearchOr("   ")).toBeNull();
  });
});

describe("dateGroupOf — KST 기준 오늘/이번주/이전", () => {
  const now = new Date("2026-06-08T01:00:00Z"); // KST 2026-06-08 10:00
  it("같은 KST 날짜는 today", () => {
    expect(dateGroupOf("2026-06-08T00:30:00Z", now)).toBe("today");
  });
  it("KST 자정 경계 분리", () => {
    expect(dateGroupOf("2026-06-07T15:30:00Z", now)).toBe("today"); // KST 6/8 00:30
    expect(dateGroupOf("2026-06-07T14:30:00Z", now)).toBe("week");  // KST 6/7 23:30
  });
  it("6일 전까지 week, 7일 이상 earlier", () => {
    expect(dateGroupOf("2026-06-02T01:00:00Z", now)).toBe("week");
    expect(dateGroupOf("2026-06-01T01:00:00Z", now)).toBe("earlier");
  });
});

describe("splitOverflow — limit+1 초과 감지", () => {
  test("101건이면 100건 + overflow true", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: String(i) }));
    const r = splitOverflow(rows, 100);
    expect(r.rows).toHaveLength(100);
    expect(r.overflow).toBe(true);
  });

  test("100 이하면 overflow false, 전건 유지", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
    const r = splitOverflow(rows, 100);
    expect(r.rows).toHaveLength(50);
    expect(r.overflow).toBe(false);
  });
});
