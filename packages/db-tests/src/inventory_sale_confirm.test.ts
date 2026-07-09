import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 재고 판매확정/취소 RPC(20260709130000).
// confirm=모든 콘솔 사용자(재고>0), cancel=equipment.manage. 로그 기록. '최종수정' 미변경.

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const EQ = "00000000-0000-0000-0000-00000000e050";

// admin=equipment.manage, sales1=권한없음(견적만).
async function seed(stock: number, sold = 0): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "a@jhtech.test");
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  await c.query("insert into public.equipment (id, name) values ($1, 'UV프린터X')", [EQ]);
  // 관리자 명의로 재고행 생성(updated_by=admin) — 이후 confirm이 최종수정을 안 건드리는지 검증에 사용.
  await asUser(c, UID.admin);
  await c.query(
    "insert into public.equipment_inventory (equipment_id, stock_qty, sold_confirmed) values ($1, $2, $3)",
    [EQ, stock, sold],
  );
}

describe("confirm_equipment_sale — 판매확정", () => {
  test("권한 없는 영업도 확정 가능(재고 -1·판매확정 +1·로그)", async () => {
    await inRollbackTx(c, async () => {
      await seed(5);
      await asUser(c, UID.sales1);
      await c.query("select public.confirm_equipment_sale($1)", [EQ]);
      const inv = await c.query("select stock_qty, sold_confirmed from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(inv.rows[0].stock_qty).toBe(4);
      expect(inv.rows[0].sold_confirmed).toBe(1);
      const log = await c.query("select action, actor_id from public.inventory_sale_log where equipment_id=$1", [EQ]);
      expect(log.rows).toHaveLength(1);
      expect(log.rows[0].action).toBe("confirm");
      expect(log.rows[0].actor_id).toBe(UID.sales1);
    });
  });

  test("재고 0이면 확정 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(0);
      await asUser(c, UID.sales1);
      await expect(c.query("select public.confirm_equipment_sale($1)", [EQ])).rejects.toThrow(/재고가 없습니다/);
    });
  });

  test("확정은 '최종수정'(updated_by)을 바꾸지 않는다(로그로만 추적)", async () => {
    await inRollbackTx(c, async () => {
      await seed(3); // updated_by=admin으로 재고행 생성됨
      await asUser(c, UID.sales1);
      await c.query("select public.confirm_equipment_sale($1)", [EQ]);
      const r = await c.query("select updated_by from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(r.rows[0].updated_by).toBe(UID.admin); // sales1이 확정했어도 최종수정은 admin 유지
    });
  });
});

describe("cancel_equipment_sale — 판매확정 취소", () => {
  test("관리자는 취소 가능(판매확정 -1·재고 +1·로그)", async () => {
    await inRollbackTx(c, async () => {
      await seed(4, 2);
      await asUser(c, UID.admin);
      await c.query("select public.cancel_equipment_sale($1)", [EQ]);
      const inv = await c.query("select stock_qty, sold_confirmed from public.equipment_inventory where equipment_id=$1", [EQ]);
      expect(inv.rows[0].stock_qty).toBe(5);
      expect(inv.rows[0].sold_confirmed).toBe(1);
      const log = await c.query("select action from public.inventory_sale_log where equipment_id=$1 and action='cancel'", [EQ]);
      expect(log.rows).toHaveLength(1);
    });
  });

  test("영업(비관리자)은 취소 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(4, 2);
      await asUser(c, UID.sales1);
      await expect(c.query("select public.cancel_equipment_sale($1)", [EQ])).rejects.toThrow(/forbidden/);
    });
  });

  test("판매확정 0이면 취소 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(4, 0);
      await asUser(c, UID.admin);
      await expect(c.query("select public.cancel_equipment_sale($1)", [EQ])).rejects.toThrow(/취소할 판매확정이 없습니다/);
    });
  });
});

describe("inventory_sale_log RLS", () => {
  test("직접 INSERT 차단(로그는 RPC[definer]만 기록)", async () => {
    await inRollbackTx(c, async () => {
      await seed(1);
      await asUser(c, UID.admin);
      await expect(
        c.query("insert into public.inventory_sale_log (equipment_id, action) values ($1, 'confirm')", [EQ]),
      ).rejects.toThrow();
    });
  });

  test("authenticated 전원 SELECT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed(2);
      await asUser(c, UID.sales1);
      await c.query("select public.confirm_equipment_sale($1)", [EQ]);
      // 다른 사용자(admin)도 로그 조회 가능
      await asUser(c, UID.admin);
      const r = await c.query("select count(*)::int as n from public.inventory_sale_log where equipment_id=$1", [EQ]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});
