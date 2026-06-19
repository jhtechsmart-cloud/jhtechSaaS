import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// equipment_inventory RLS·트리거(#4 C1).
// 쓰기=equipment.manage, 읽기=authenticated 전원. updated_at/updated_by는 트리거 강제(클라 위조 무시).

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const EQ = "00000000-0000-0000-0000-00000000e001";

// admin=equipment.manage, sales1=권한없음(견적만).
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "a@jhtech.test");
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  await c.query("insert into public.equipment (id, name) values ($1, 'UV프린터X')", [EQ]);
}

describe("equipment_inventory RLS", () => {
  test("equipment.manage 보유자는 재고 upsert 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      await c.query(
        "insert into public.equipment_inventory (equipment_id, stock_qty, note) values ($1, 5, '입고됨')",
        [EQ],
      );
      const r = await c.query("select stock_qty, note from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(r.rows[0].stock_qty).toBe(5);
      expect(r.rows[0].note).toBe("입고됨");
    });
  });

  test("권한 없는 사용자는 INSERT 차단(RLS)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.equipment_inventory (equipment_id, stock_qty) values ($1, 3)", [EQ]),
      ).rejects.toThrow();
    });
  });

  test("stock_qty 음수 거부(CHECK)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      await expect(
        c.query("insert into public.equipment_inventory (equipment_id, stock_qty) values ($1, -1)", [EQ]),
      ).rejects.toThrow();
    });
  });

  test("updated_by는 auth.uid()로 강제(클라가 다른 값 줘도 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      // 클라가 updated_by를 sales1로 위조 시도 → 트리거가 admin(auth.uid())으로 덮어씀.
      await c.query(
        "insert into public.equipment_inventory (equipment_id, stock_qty, updated_by) values ($1, 1, $2)",
        [EQ, UID.sales1],
      );
      const r = await c.query("select updated_by from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(r.rows[0].updated_by).toBe(UID.admin);
    });
  });

  test("authenticated 전원 SELECT 가능(권한 없어도 조회)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      await c.query("insert into public.equipment_inventory (equipment_id, stock_qty) values ($1, 7)", [EQ]);
      // 권한 없는 sales1도 조회 가능.
      await asUser(c, UID.sales1);
      const r = await c.query("select stock_qty from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(r.rows[0].stock_qty).toBe(7);
    });
  });
});
