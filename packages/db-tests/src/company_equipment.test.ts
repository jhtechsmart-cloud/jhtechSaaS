import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "ce-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "ce-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'장비',1000,'active')", [EQ]);
  const r = await c.query("insert into public.companies (name) values ('보유사') returning id");
  return r.rows[0].id as string;
}

describe("company_equipment — identity XOR CHECK", () => {
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("label만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,label) values ($1,'단종장비') returning id", [cid]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id,equipment_id,label) values ($1,$2,'x')", [cid, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  test("미보유 sales INSERT 거부 / anon 직접 SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed();
      await asUser(c, UID.sales1);
      // SAVEPOINT로 에러 격리 — 실패한 문이 트랜잭션 전체를 ABORTED로 만들므로
      // 같은 txn 내 후속 쿼리를 계속 실행하려면 savepoint/rollback to 필요.
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.company_equipment (company_id,label) values ($1,'금지')", [cid])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'행')", [cid]);
      await asAnon(c);
      expect((await c.query("select id from public.company_equipment")).rowCount).toBe(0);
    });
  });
  test("company 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const cid = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'a')", [cid]);
      await c.query("delete from public.companies where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.company_equipment where company_id=$1", [cid])).rowCount).toBe(0);
    });
  });
});
