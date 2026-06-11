import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// anon 직접 INSERT는 정책 제거로 전면 차단(applications.test.ts에서 단언) —
// 길이 CHECK는 역할 무관 테이블 제약이므로 postgres 컨텍스트로 검증한다(RPC·서버 경로 공통 방어선).
describe("applications 길이 CHECK 제약 (보안 — 폭주 입력 차단)", () => {
  test("company 201자 → CHECK 위반 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expect(
        c.query("insert into public.applications (company) values ($1)", ["가".repeat(201)]),
      ).rejects.toThrow();
    });
  });
  test("정상 길이 company는 통과", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expect(
        c.query("insert into public.applications (company) values ($1)", ["정상회사"]),
      ).resolves.toBeTruthy();
    });
  });
  test("address 501자 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expect(
        c.query("insert into public.applications (company, address) values ('A', $1)", ["주".repeat(501)]),
      ).rejects.toThrow();
    });
  });
  test("fields 8KB 초과 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const big = JSON.stringify({ x: "y".repeat(9000) });
      await expect(
        c.query("insert into public.applications (company, fields) values ('A', $1::jsonb)", [big]),
      ).rejects.toThrow();
    });
  });
});
