import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 장비출고의뢰서 — 채번·1:1·RLS·발행본 불변.
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seedApp(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
  const a = await c.query("insert into public.applications (company, email) values ('애드넷','c@x.com') returning id");
  return a.rows[0].id as string;
}

describe("release_orders — 채번·1:1·RLS·불변", () => {
  test("write 권한+배정자는 INSERT, seq_no 자동 채번(REL-)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asPostgres(c);
      await c.query("update public.applications set assignee_id=$1 where id=$2", [UID.sales1, appId]);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','애드넷') returning seq_no, status",
        [appId],
      );
      expect(r.rows[0].seq_no).toMatch(/^REL-\d{8}-\d{5}$/);
      expect(r.rows[0].status).toBe("draft");
    });
  });

  test("권한 없으면 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asUser(c, UID.sales2); // 권한 없음
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("의뢰당 1건만(UNIQUE application_id)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      await c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]);
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'cutter','y')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("발행본(issued)은 device_kind 동결(불변 트리거), pdf_url은 허용", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company, status) values ($1,'printer','x','issued') returning id",
        [appId],
      );
      const id = r.rows[0].id as string;
      const okPdf = await c.query("update public.release_orders set pdf_url='p.pdf' where id=$1 returning id", [id]);
      expect(okPdf.rowCount).toBe(1);
      await expect(
        c.query("update public.release_orders set device_kind='cutter' where id=$1", [id]),
      ).rejects.toThrow();
    });
  });
});
