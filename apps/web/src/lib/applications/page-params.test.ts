import { describe, expect, test } from "vitest";
import { pageParamsSchema, PAGE_LIMIT_MAX } from "./page-params";

// 서버 액션(fetchApplicationsPage)은 직접 POST로도 도달 가능 — 음수 offset·거대 limit을 서버에서 거부.
describe("pageParamsSchema — 목록 페이지 파라미터 검증", () => {
  const ok = { scope: "active", offset: 0, limit: 30 };

  test("정상 파라미터 통과(q 생략 가능)", () => {
    expect(pageParamsSchema.safeParse(ok).success).toBe(true);
    expect(pageParamsSchema.safeParse({ ...ok, q: "재현" }).success).toBe(true);
  });

  test("음수 offset 거부", () => {
    expect(pageParamsSchema.safeParse({ ...ok, offset: -1 }).success).toBe(false);
  });

  test("limit 상한 초과·0 이하 거부", () => {
    expect(pageParamsSchema.safeParse({ ...ok, limit: PAGE_LIMIT_MAX + 1 }).success).toBe(false);
    expect(pageParamsSchema.safeParse({ ...ok, limit: 0 }).success).toBe(false);
  });

  test("소수·문자열 숫자 거부(정수만)", () => {
    expect(pageParamsSchema.safeParse({ ...ok, offset: 1.5 }).success).toBe(false);
    expect(pageParamsSchema.safeParse({ ...ok, limit: "30" }).success).toBe(false);
  });

  test("scope enum 외 값 거부", () => {
    expect(pageParamsSchema.safeParse({ ...ok, scope: "deleted" }).success).toBe(false);
  });

  test("q 과도 길이(201자) 거부", () => {
    expect(pageParamsSchema.safeParse({ ...ok, q: "가".repeat(201) }).success).toBe(false);
  });
});
