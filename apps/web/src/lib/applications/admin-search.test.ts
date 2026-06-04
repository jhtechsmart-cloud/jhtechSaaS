import { describe, expect, test } from "vitest";
import { buildSearchOr, splitOverflow } from "./admin-search";

describe("buildSearchOr — PostgREST .or 안전 생성", () => {
  test("빈 검색어는 null(필터 없음)", () => {
    expect(buildSearchOr("")).toBeNull();
    expect(buildSearchOr("   ")).toBeNull();
  });

  test("정상 검색어는 company·seq_no ilike OR", () => {
    expect(buildSearchOr("재현")).toBe("company.ilike.%재현%,seq_no.ilike.%재현%");
  });

  test("메타문자(,()%_*\\)는 제거 — 필터/와일드카드 주입 차단", () => {
    expect(buildSearchOr("a,b(c)%_*\\d")).toBe("company.ilike.%abcd%,seq_no.ilike.%abcd%");
  });

  test("REQ- 하이픈은 보존(접수번호 검색)", () => {
    expect(buildSearchOr("REQ-2026")).toBe("company.ilike.%REQ-2026%,seq_no.ilike.%REQ-2026%");
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
