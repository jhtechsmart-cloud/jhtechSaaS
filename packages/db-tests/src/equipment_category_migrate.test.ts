import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("equipment category_id 전환 마이그레이션", () => {
  test("equipment.category_id 컬럼 존재, category 컬럼 제거됨", async () => {
    await asPostgres(c);
    const cols = await c.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='equipment' and column_name in ('category','category_id')",
    );
    const names = cols.rows.map((r: { column_name: string }) => r.column_name);
    expect(names).toContain("category_id");
    expect(names).not.toContain("category");
  });
  test("equipment.category_id → equipment_category FK", async () => {
    await asPostgres(c);
    const fk = await c.query(`
      select 1 from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
      where tc.table_name='equipment' and tc.constraint_type='FOREIGN KEY' and ccu.table_name='equipment_category'`);
    expect(fk.rowCount).toBeGreaterThan(0);
  });
  test("equipment_public 뷰가 category(분류명)를 노출", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const cat = await c.query("insert into public.equipment_category (name) values ('마이그테스트분류') returning id", []);
      await c.query("insert into public.equipment (name,category_id,base_price,status) values ('뷰장비',$1,1000,'active')", [cat.rows[0].id]);
      const v = await c.query("select category from public.equipment_public where name='뷰장비'");
      expect(v.rows[0].category).toBe("마이그테스트분류");
    });
  });
});
