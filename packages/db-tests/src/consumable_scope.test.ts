import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

// 소모품 1건 + 장비 1건을 심고 consumable_id 반환. admin=consumables.manage.
async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "scope-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "scope-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'UV프린터A','UV프린터',1000,'active')", [EQ]);
  const r = await c.query("insert into public.consumables (name) values ('UV잉크') returning id", []);
  return r.rows[0].id as string;
}

describe("consumable_scope — 분류 XOR 장비 CHECK + RLS", () => {
  test("category만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터') returning id", [cid]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category,equipment_id) values ($1,'UV프린터',$2)", [cid, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  test("같은 소모품·분류 중복 → 거부(부분 UNIQUE)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await asAnon(c);
      expect((await c.query("select id from public.consumable_scope")).rowCount).toBe(0);
    });
  });
  test("consumable 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [cid]);
      await c.query("delete from public.consumables where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.consumable_scope where consumable_id=$1", [cid])).rowCount).toBe(0);
    });
  });
  test("equipment 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ]);
      // equipment.manage 권한 없음 → 슈퍼유저로 삭제해 cascade 검증
      await asPostgres(c);
      await c.query("delete from public.equipment where id=$1", [EQ]);
      expect((await c.query("select id from public.consumable_scope where equipment_id=$1", [EQ])).rowCount).toBe(0);
    });
  });
});
