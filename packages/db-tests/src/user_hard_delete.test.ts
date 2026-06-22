// 사용자 하드 삭제(2026-06-22) — FK 삭제 동작 계약 검증.
// 결정: 담당자(assignee_id) FK는 NO ACTION 유지(참조 있으면 삭제 차단=재배정 강제),
//       감사기록(작성자) FK는 ON DELETE SET NULL(이력 보존·작성자만 비움).
// 실삭제 경로 = auth.users 1행 삭제 → profiles(id) on delete cascade → 위 FK 동작.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// confdeltype: 'a'=NO ACTION, 'n'=SET NULL.
async function delType(conname: string): Promise<string> {
  const r = await c.query<{ confdeltype: string }>(
    "select confdeltype from pg_constraint where conname = $1",
    [conname],
  );
  return r.rows[0]?.confdeltype ?? "";
}

describe("user hard delete — FK 삭제 동작", () => {
  test("담당자(assignee) FK 5종은 NO ACTION(=차단) 유지", async () => {
    for (const name of [
      "companies_assignee_id_fkey",
      "applications_assignee_id_fkey",
      "quotes_assignee_id_fkey",
      "supply_requests_assignee_id_fkey",
      "service_requests_assignee_id_fkey",
    ]) {
      expect(await delType(name), name).toBe("a");
    }
  });

  test("감사기록(작성자) FK 4종은 SET NULL", async () => {
    for (const name of [
      "demo_reservations_created_by_fkey",
      "release_orders_created_by_fkey",
      "equipment_inventory_updated_by_fkey",
      "email_log_from_user_id_fkey",
    ]) {
      expect(await delType(name), name).toBe("n");
    }
  });

  test("demo_reservations.created_by 는 nullable 로 전환됨", async () => {
    const r = await c.query<{ attnotnull: boolean }>(
      "select attnotnull from pg_attribute where attrelid='public.demo_reservations'::regclass and attname='created_by'",
    );
    expect(r.rows[0].attnotnull).toBe(false);
  });

  test("담당 고객사가 있으면 계정 삭제가 거부된다(재배정 강제)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "del-block@jhtech.test");
      await c.query("insert into public.companies (name, assignee_id) values ('차단테스트사', $1)", [
        UID.sales1,
      ]);
      await expect(
        c.query("delete from auth.users where id=$1", [UID.sales1]),
      ).rejects.toThrow();
    });
  });

  test("담당 건이 없으면 계정이 완전히 삭제된다(profiles 동반)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "del-clean@jhtech.test");
      const r = await c.query("delete from auth.users where id=$1", [UID.sales2]);
      expect(r.rowCount).toBe(1);
      const p = await c.query("select 1 from public.profiles where id=$1", [UID.sales2]);
      expect(p.rowCount).toBe(0);
    });
  });

  test("작성한 데모예약은 보존되고 created_by만 NULL이 된다(서버필드 트리거 보정 확인)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "del-audit@jhtech.test");
      const eq = await c.query<{ id: string }>(
        "insert into public.equipment (name) values ('데모장비') returning id",
      );
      const eqId = eq.rows[0].id;
      // postgres(auth.uid()=NULL)는 트리거가 지정 created_by 유지.
      await c.query(
        `insert into public.demo_reservations (customer_name, equipment_id, time_range, created_by)
         values ('고객사', $1, tstzrange('2030-01-01 10:00:00+09','2030-01-01 11:00:00+09'), $2)`,
        [eqId, UID.sales1],
      );
      await c.query("delete from auth.users where id=$1", [UID.sales1]);
      const dr = await c.query<{ created_by: string | null }>(
        "select created_by from public.demo_reservations where equipment_id=$1",
        [eqId],
      );
      expect(dr.rowCount).toBe(1); // 예약(이력) 보존
      expect(dr.rows[0].created_by).toBeNull(); // 작성자만 비움
    });
  });
});
