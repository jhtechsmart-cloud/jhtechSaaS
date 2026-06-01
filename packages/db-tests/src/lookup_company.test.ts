import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ_ACTIVE = "00000000-0000-0000-0000-0000000000e1";
const EQ_INACTIVE = "00000000-0000-0000-0000-0000000000e2";

async function seed(): Promise<void> {
  await asPostgres(c);
  await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'활성기',1000,'active'),($2,'비활성기',2000,'inactive')", [EQ_ACTIVE, EQ_INACTIVE]);
  const co = await c.query("insert into public.companies (name,biz_no,phone) values ('조회상사','1234567890','010') returning id");
  const cid = co.rows[0].id;
  await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2)", [cid, EQ_ACTIVE]);
  await c.query("insert into public.company_equipment (company_id,equipment_id) values ($1,$2)", [cid, EQ_INACTIVE]);
  await c.query("insert into public.company_equipment (company_id,label) values ($1,'단종품')", [cid]);
}

describe("lookup_company_by_biz_no — anon RPC", () => {
  test("유효 biz_no(대시 포함) → 회사+장비 jsonb", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const r = await c.query("select public.lookup_company_by_biz_no('123-45-67890') as j");
      const j = r.rows[0].j;
      expect(j.name).toBe("조회상사");
      expect(j.phone).toBe("010");
      expect(j.equipment).toHaveLength(3);
    });
  });
  test("inactive 장비명 미노출(equipment_public 경유) — name=null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const j = (await c.query("select public.lookup_company_by_biz_no('1234567890') as j")).rows[0].j;
      const active = j.equipment.find((e: any) => e.equipment_id === EQ_ACTIVE);
      const inactive = j.equipment.find((e: any) => e.equipment_id === EQ_INACTIVE);
      expect(active.equipment_name).toBe("활성기");
      expect(inactive.equipment_name).toBeNull();
    });
  });
  test("미등록 biz_no → null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      expect((await c.query("select public.lookup_company_by_biz_no('9999999999') as j")).rows[0].j).toBeNull();
    });
  });
  test("형식 오류 → null", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      expect((await c.query("select public.lookup_company_by_biz_no('abc') as j")).rows[0].j).toBeNull();
    });
  });
});
