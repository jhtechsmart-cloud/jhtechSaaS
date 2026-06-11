import { describe, expect, test } from "vitest";
import { companyPageParamsSchema, COMPANY_PAGE_LIMIT_MAX } from "./page-params";

// 고객 목록 서버 액션 파라미터 검증 — 직접 POST 방어(applications page-params와 동일 패턴).
describe("companyPageParamsSchema", () => {
  const ok = { scope: "all", sort: "name", offset: 0, limit: 30 };

  test("정상 통과(q 생략 가능)", () => {
    expect(companyPageParamsSchema.safeParse(ok).success).toBe(true);
    expect(companyPageParamsSchema.safeParse({ ...ok, q: "수아트" }).success).toBe(true);
  });

  test("scope·sort enum 외 거부", () => {
    expect(companyPageParamsSchema.safeParse({ ...ok, scope: "deleted" }).success).toBe(false);
    expect(companyPageParamsSchema.safeParse({ ...ok, sort: "oldest" }).success).toBe(false);
  });

  test("음수 offset·상한 초과 limit 거부", () => {
    expect(companyPageParamsSchema.safeParse({ ...ok, offset: -1 }).success).toBe(false);
    expect(companyPageParamsSchema.safeParse({ ...ok, limit: COMPANY_PAGE_LIMIT_MAX + 1 }).success).toBe(false);
  });
});
