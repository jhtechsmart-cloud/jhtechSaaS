import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// admin=consumables.manage 보유, sales1=무권한
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cons-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cons-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
}

describe("consumables — RLS(consumables.manage 게이트)", () => {
  test("권한자 INSERT/UPDATE/DELETE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumables (name,unit) values ('UV잉크-시안','병') returning id", []);
      expect(r.rowCount).toBe(1);
      const id = r.rows[0].id as string;
      const u = await c.query("update public.consumables set sku='INK-C' where id=$1 returning id", [id]);
      expect(u.rowCount).toBe(1);
      const d = await c.query("delete from public.consumables where id=$1 returning id", [id]);
      expect(d.rowCount).toBe(1);
    });
  });

  test("무권한 sales INSERT 거부 / 로그인 전원 SELECT 가능 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumables (name) values ('금지')", [])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.consumables (name) values ('세정액')", []);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.consumables")).rowCount).toBeGreaterThan(0);
      await asAnon(c);
      expect((await c.query("select id from public.consumables")).rowCount).toBe(0);
    });
  });

  test("created_at/updated_at은 트리거가 강제(클라 지정 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query(
        "insert into public.consumables (name,created_at) values ('a','2000-01-01') returning created_at",
        [],
      );
      expect(new Date(r.rows[0].created_at as string).getFullYear()).toBeGreaterThan(2020);
    });
  });

  test("status는 active|inactive만 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumables (name,status) values ('x','bogus')", [])).rejects.toThrow();
    });
  });
});
