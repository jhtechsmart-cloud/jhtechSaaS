// M2 P-E #23 — anon 읽기 RPC: list_consumables_for_company(매칭 소모품·그룹핑·가격제외) +
// last_supply_request_for_company(직전 신청 프리필). C1 회귀가드: consumables_for_equipment는 anon 직접 호출 불가 유지.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const EQ_UV = "00000000-0000-0000-0000-0000000000e1";

// 분류(프린터>UV프린터) + 장비 UVA + 소모품(UV잉크 소분류 / 세정액 대분류 / 단종 inactive) + 회사+보유장비(UVA).
// {companyId, ink, clean, dead} 반환. 회사 biz='1234567891'.
async function seed(): Promise<{ companyId: string; ink: string; clean: string; dead: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "lcc-sales1@jhtech.test");
  const printer = (await c.query("insert into public.equipment_category (name) values ('프린터') returning id")).rows[0].id;
  const uv = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [printer])).rows[0].id;
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UVA',$2,1,'active')", [EQ_UV, uv]);
  const ink = (await c.query("insert into public.consumables (name,unit,price) values ('UV잉크','개',50000) returning id")).rows[0].id;
  const clean = (await c.query("insert into public.consumables (name,unit,price) values ('세정액','병',9000) returning id")).rows[0].id;
  const dead = (await c.query("insert into public.consumables (name,status) values ('단종','inactive') returning id")).rows[0].id;
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [ink, uv]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, printer]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [dead, printer]);
  const co = (await c.query("insert into public.companies (name, biz_no, assignee_id) values ('소모품상사','1234567891',$1) returning id", [UID.sales1])).rows[0].id;
  await c.query("insert into public.company_equipment (company_id, equipment_id) values ($1,$2)", [co, EQ_UV]);
  return { companyId: co, ink, clean, dead };
}

describe("list_consumables_for_company — 매칭·그룹핑·가격제외", () => {
  test("등록고객 → 보유장비 매칭 active 소모품(UV잉크·세정액), 단종 제외", async () => {
    await inRollbackTx(c, async () => {
      const { dead } = await seed(); await asAnon(c);
      const out = (await c.query("select public.list_consumables_for_company('1234567891') as out")).rows[0].out;
      const names = (out.consumables as Array<{ name: string }>).map((x) => x.name).sort();
      expect(names).toEqual(["UV잉크", "세정액"].sort());
      const ids = (out.consumables as Array<{ id: string }>).map((x) => x.id);
      expect(ids).not.toContain(dead);
    });
  });

  test("가격(price)은 절대 반환하지 않는다", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const out = (await c.query("select public.list_consumables_for_company('1234567891') as out")).rows[0].out;
      const raw = JSON.stringify(out);
      expect(raw).not.toContain("price");
      expect(raw).not.toContain("50000");
      for (const item of out.consumables as Array<Record<string, unknown>>) {
        expect(item.price).toBeUndefined();
        expect(Object.keys(item).sort()).toEqual(["id", "name", "unit"].sort());
      }
    });
  });

  test("장비별 그룹핑(groups)에 매칭 소모품이 담긴다", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const out = (await c.query("select public.list_consumables_for_company('1234567891') as out")).rows[0].out;
      expect(Array.isArray(out.groups)).toBe(true);
      expect(out.groups.length).toBe(1);
      expect(out.groups[0].equipment_id).toBe(EQ_UV);
      const gnames = (out.groups[0].consumables as Array<{ name: string }>).map((x) => x.name).sort();
      expect(gnames).toEqual(["UV잉크", "세정액"].sort());
    });
  });

  test("미등록 biz_no / 형식오류 → 빈 결과(groups·consumables 빈 배열)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const out1 = (await c.query("select public.list_consumables_for_company('9999999999') as out")).rows[0].out;
      expect(out1.consumables).toEqual([]);
      expect(out1.groups).toEqual([]);
      const out2 = (await c.query("select public.list_consumables_for_company('abc') as out")).rows[0].out;
      expect(out2.consumables).toEqual([]);
    });
  });

  test("보유장비 0대(등록됐으나 장비없음) → 빈 결과", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.companies (name, biz_no) values ('장비없는상사','1234567891')");
      await asAnon(c);
      const out = (await c.query("select public.list_consumables_for_company('1234567891') as out")).rows[0].out;
      expect(out.consumables).toEqual([]);
      expect(out.groups).toEqual([]);
    });
  });
});

describe("C1 회귀가드 — consumables_for_equipment는 anon 직접 호출 불가", () => {
  test("anon이 consumables_for_equipment 직접 호출 → permission denied", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      await expect(
        c.query("select * from public.consumables_for_equipment($1)", [EQ_UV]),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe("last_supply_request_for_company — 직전 신청 프리필", () => {
  test("직전 신청의 items(consumable_id·qty) 반환, 가격 미포함", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink, clean } = await seed(); await asPostgres(c);
      const reqId = (await c.query(
        `insert into public.supply_requests (company_id, requester_name, requester_phone, privacy_consent, privacy_consent_at, privacy_consent_version)
         values ($1,'담당','010',true,now(),'v1.0') returning id`, [companyId],
      )).rows[0].id;
      await c.query(`insert into public.supply_request_items (request_id, consumable_id, consumable_name_snapshot, qty) values ($1,$2,'UV잉크',3)`, [reqId, ink]);
      await c.query(`insert into public.supply_request_items (request_id, consumable_id, consumable_name_snapshot, qty) values ($1,$2,'세정액',2)`, [reqId, clean]);
      await asAnon(c);
      const out = (await c.query("select public.last_supply_request_for_company('1234567891') as out")).rows[0].out;
      const items = out.items as Array<{ consumable_id: string; qty: number }>;
      expect(items.length).toBe(2);
      const byId = Object.fromEntries(items.map((x) => [x.consumable_id, x.qty]));
      expect(byId[ink]).toBe(3);
      expect(byId[clean]).toBe(2);
      expect(JSON.stringify(out)).not.toContain("price");
    });
  });

  test("직전 신청 없으면 빈 items", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      const out = (await c.query("select public.last_supply_request_for_company('1234567891') as out")).rows[0].out;
      expect(out.items).toEqual([]);
    });
  });
});
