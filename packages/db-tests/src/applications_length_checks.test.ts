import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("applications 길이 CHECK 제약 (보안 — 직접 INSERT 우회 차단)", () => {
  test("anon 직접 INSERT: company 201자 → CHECK 위반 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company) values ($1)", ["가".repeat(201)]),
      ).rejects.toThrow();
    });
  });
  test("anon 직접 INSERT: 정상 길이 company는 통과", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company) values ($1)", ["정상회사"]),
      ).resolves.toBeTruthy();
    });
  });
  test("address 501자 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company, address) values ('A', $1)", ["주".repeat(501)]),
      ).rejects.toThrow();
    });
  });
  test("fields 8KB 초과 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const big = JSON.stringify({ x: "y".repeat(9000) });
      await expect(
        c.query("insert into public.applications (company, fields) values ('A', $1::jsonb)", [big]),
      ).rejects.toThrow();
    });
  });
});
