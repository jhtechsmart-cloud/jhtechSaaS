// company_equipment RLS·CHECK·트리거 통합 테스트.
// E5a: 부모 company 스코프 — SELECT/UPDATE/DELETE는 부모가 본인 담당 OR customers.view_all,
//   INSERT는 customers.edit AND 부모 소유(아무 company_id에나 자식 못 꽂게).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

// 부모 2개: mine(sales1 담당), theirs(sales2 담당). 반환 [mineId, theirsId].
async function seed(): Promise<{ mine: string; theirs: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "ce-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "ce-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "ce-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{customers.edit}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
  await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'장비',1000,'active')", [EQ]);
  const mine = await c.query("insert into public.companies (name,assignee_id) values ('내고객',$1) returning id", [UID.sales1]);
  const theirs = await c.query("insert into public.companies (name,assignee_id) values ('남고객',$1) returning id", [UID.sales2]);
  return { mine: mine.rows[0].id, theirs: theirs.rows[0].id };
}

describe("company_equipment — identity XOR CHECK", () => {
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2) returning id", [mine, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("label만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.company_equipment (company_id,label) values ($1,'단종장비') returning id", [mine]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id,equipment_id,label) values ($1,$2,'x')", [mine, EQ])).rejects.toThrow();
    });
  });
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.company_equipment (company_id) values ($1)", [mine])).rejects.toThrow();
    });
  });
});

describe("company_equipment — INSERT 부모검증 (customers.edit AND 부모 소유)", () => {
  test("sales1은 본인 담당 부모에 INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.sales1);
      const r = await c.query("insert into public.company_equipment (company_id,label) values ($1,'내장비') returning id", [mine]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("sales1은 타인 담당 부모에 INSERT 거부 (누수 차단)", async () => {
    await inRollbackTx(c, async () => {
      const { theirs } = await seed(); await asUser(c, UID.sales1);
      await expect(c.query("insert into public.company_equipment (company_id,label) values ($1,'침범')", [theirs])).rejects.toThrow();
    });
  });
  test("권한 없는 sales2 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      const { theirs } = await seed(); await asUser(c, UID.sales2);
      await expect(c.query("insert into public.company_equipment (company_id,label) values ($1,'금지')", [theirs])).rejects.toThrow();
    });
  });
});

describe("company_equipment — SELECT 스코프 (부모 본인 담당 OR view_all)", () => {
  test("anon 직접 SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'행')", [mine]);
      await asAnon(c);
      expect((await c.query("select id from public.company_equipment")).rowCount).toBe(0);
    });
  });
  test("sales1은 본인 담당 부모의 장비만, 타인 부모 장비는 0행", async () => {
    await inRollbackTx(c, async () => {
      const { mine, theirs } = await seed(); await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'내장비'),($2,'남장비')", [mine, theirs]);
      await asUser(c, UID.sales1);
      const r = await c.query("select label from public.company_equipment order by label");
      expect(r.rows.map((x: { label: string }) => x.label)).toEqual(["내장비"]);
    });
  });
  test("admin(super)은 전체 장비 조회", async () => {
    await inRollbackTx(c, async () => {
      const { mine, theirs } = await seed(); await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'a'),($2,'b')", [mine, theirs]);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.company_equipment")).rowCount).toBe(2);
    });
  });
  test("customers.view_all 보유자는 전체 장비 조회", async () => {
    await inRollbackTx(c, async () => {
      const { mine, theirs } = await seed();
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{customers.view_all}' where id=$1", [UID.sales2]);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'a'),($2,'b')", [mine, theirs]);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.company_equipment")).rowCount).toBe(2);
    });
  });
});

describe("company_equipment — cascade", () => {
  test("company 삭제 시 cascade", async () => {
    await inRollbackTx(c, async () => {
      const { mine } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.company_equipment (company_id,label) values ($1,'a')", [mine]);
      await c.query("delete from public.companies where id=$1", [mine]);
      await asPostgres(c);
      expect((await c.query("select id from public.company_equipment where company_id=$1", [mine])).rowCount).toBe(0);
    });
  });
});
