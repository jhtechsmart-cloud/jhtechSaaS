import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("privacy_policies RLS", () => {
  test("anon은 SELECT 가능(동의 문구 표시)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select version from public.privacy_policies where version='v1.0'");
      expect(r.rowCount).toBeGreaterThan(0);
    });
  });

  test("anon은 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });

  test("users.manage 없는 로그인 사용자는 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@x.com");
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });
});
