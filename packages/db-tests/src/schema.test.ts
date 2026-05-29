import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// AC1: 전 도메인 테이블 RLS 활성 — 권한 버그 = 전체 데이터 노출이므로 불변 가드.
describe("스키마 불변식", () => {
  test("6개 도메인 테이블 모두 RLS 활성", async () => {
    const r = await c.query(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('profiles','equipment','equipment_option','applications','quotes','email_log')
       order by relname`,
    );
    expect(r.rowCount).toBe(6);
    for (const row of r.rows) {
      expect(row.relrowsecurity, `${row.relname} RLS`).toBe(true);
    }
  });
});
