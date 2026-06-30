import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 의뢰 삭제 — 관리자(users.manage)만 + 견적·출고의뢰서 ON DELETE CASCADE.
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// 의뢰 + 발행 견적 + 출고의뢰서 시드(서버 권위 트리거 통과 위해 postgres로 삽입).
async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  const a = await c.query("insert into public.applications (company) values ('삭제대상') returning id");
  const appId = a.rows[0].id as string;
  await c.query(
    `insert into public.quotes (application_id, status, assignee_id, items)
     values ($1,'issued',$2,'[{"name":"UV3300S"}]')`,
    [appId, UID.admin],
  );
  await c.query(
    "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','삭제대상')",
    [appId],
  );
  return appId;
}

describe("applications 삭제 — 관리자 전용 + cascade", () => {
  test("users.manage 관리자: 의뢰 삭제 → 견적·출고의뢰서 cascade 제거", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seed();
      await asUser(c, UID.admin);
      const del = await c.query("delete from public.applications where id=$1 returning id", [appId]);
      expect(del.rowCount).toBe(1);

      await asPostgres(c);
      expect((await c.query("select count(*)::int n from public.quotes where application_id=$1", [appId])).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from public.release_orders where application_id=$1", [appId])).rows[0].n).toBe(0);
    });
  });

  test("users.manage 없으면 삭제 거부(RLS 0행, 의뢰 보존)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seed();
      await asUser(c, UID.sales1); // users.manage 없음
      const del = await c.query("delete from public.applications where id=$1 returning id", [appId]);
      expect(del.rowCount).toBe(0); // RLS로 0행

      await asPostgres(c);
      expect((await c.query("select count(*)::int n from public.applications where id=$1", [appId])).rows[0].n).toBe(1);
    });
  });
});
