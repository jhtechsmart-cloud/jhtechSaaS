import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cat-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cat-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
}

describe("equipment_category — 2단계 taxonomy RLS", () => {
  test("대분류·소분류 생성 성공(권한자)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      expect(p.rowCount).toBe(1);
      const child = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      expect(child.rowCount).toBe(1);
    });
  });
  test("3단계(손자) → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      const ch = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'손자')", [ch.rows[0].id])).rejects.toThrow();
    });
  });
  test("대분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await expect(c.query("insert into public.equipment_category (name) values ('프린터')", [])).rejects.toThrow();
    });
  });
  test("같은 부모 아래 소분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / 로그인 SELECT 허용 / anon 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.equipment_category (name) values ('금지')", [])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBeGreaterThan(0);
      await asAnon(c);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBe(0);
    });
  });
  test("참조 있는 노드 삭제 차단(restrict): 소분류가 있으면 대분류 삭제 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("delete from public.equipment_category where id=$1", [p.rows[0].id])).rejects.toThrow();
    });
  });
});
