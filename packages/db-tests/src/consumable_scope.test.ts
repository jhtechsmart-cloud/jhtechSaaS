import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });
const EQ = "00000000-0000-0000-0000-0000000000e1";

// seed: admin·sales 유저, equipment_category, equipment, consumables 행 생성
async function seed(): Promise<{ cid: string; catId: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "scope-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "scope-sales@jhtech.test");
  // admin에게 consumables.manage 권한 부여
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  // 분류 생성
  const cat = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
  // 장비 생성 (category_id FK 사용)
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UV프린터A',$2,1000,'active')", [EQ, cat.rows[0].id]);
  // 소모품 생성
  const r = await c.query("insert into public.consumables (name) values ('UV잉크') returning id", []);
  return { cid: r.rows[0].id as string, catId: cat.rows[0].id as string };
}

describe("consumable_scope — category_id XOR equipment_id + RLS", () => {
  // category_id만 지정하면 정상 삽입
  test("category_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2) returning id", [cid, catId]);
      expect(r.rowCount).toBe(1);
    });
  });
  // equipment_id만 지정하면 정상 삽입
  test("equipment_id만 → 성공", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2) returning id", [cid, EQ]);
      expect(r.rowCount).toBe(1);
    });
  });
  // category_id + equipment_id 동시 지정 → XOR 제약 위반
  test("둘 다 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id,equipment_id) values ($1,$2,$3)", [cid, catId, EQ])).rejects.toThrow();
    });
  });
  // 둘 다 null → XOR 제약 위반
  test("둘 다 없음 → 거부(XOR)", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.consumable_scope (consumable_id) values ($1)", [cid])).rejects.toThrow();
    });
  });
  // 같은 소모품·분류 조합 중복 → 부분 UNIQUE 위반
  test("같은 소모품·분류 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId])).rejects.toThrow();
    });
  });
  // 같은 소모품·장비 조합 중복 → 부분 UNIQUE 위반
  test("같은 소모품·장비 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { cid } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ]);
      await expect(c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [cid, EQ])).rejects.toThrow();
    });
  });
  // sales 권한 없음 → INSERT 거부 / anon → SELECT 0행
  test("무권한 sales INSERT 거부 / anon SELECT 0행", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      // postgres로 직접 삽입 후 anon SELECT 검증
      await asPostgres(c);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await asAnon(c);
      expect((await c.query("select id from public.consumable_scope")).rowCount).toBe(0);
    });
  });
  // consumable 삭제 시 scope cascade 삭제
  test("consumable 삭제 시 scope cascade", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      await c.query("delete from public.consumables where id=$1", [cid]);
      await asPostgres(c);
      expect((await c.query("select id from public.consumable_scope where consumable_id=$1", [cid])).rowCount).toBe(0);
    });
  });
  // 사용 중 분류 삭제 → restrict 차단
  // postgres 역할로 RLS 우회 후 FK restrict 자체를 검증 (authenticated 역할은 RLS가 먼저 막아 0행 삭제로 처리됨)
  test("사용 중 분류 삭제 차단(restrict)", async () => {
    await inRollbackTx(c, async () => {
      const { cid, catId } = await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [cid, catId]);
      // postgres 역할에서 직접 삭제 시도 → FK restrict 발동
      await asPostgres(c);
      await expect(c.query("delete from public.equipment_category where id=$1", [catId])).rejects.toThrow();
    });
  });
});
