import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asPostgres,
  asService,
  asUser,
  inRollbackTx,
  makeClient,
  seedAuthUser,
  UID,
} from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// sales1=email.send, sales2=권한없음, admin=applications.view_all
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query("update public.profiles set permissions='{email.send}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
}

describe("email_log — RLS 쓰기", () => {
  test("email.send 없는 사용자는 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query("insert into public.email_log (to_email) values ('a@b.com')"),
      ).rejects.toThrow();
    });
  });

  test("email.send 보유자는 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into public.email_log (to_email) values ('a@b.com')");
      await asPostgres(c);
      const r = await c.query("select count(*)::int n from public.email_log");
      expect(r.rows[0].n).toBe(1);
    });
  });
});

describe("email_log — RLS SELECT", () => {
  test("email.send 보유자는 본다, 권한 없는 사용자는 못 본다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await c.query("insert into public.email_log (to_email) values ('x@y.com')");
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.email_log")).rowCount).toBe(1);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.email_log")).rowCount).toBe(0);
    });
  });
});

describe("email_log — UPDATE는 워커(service_role)만", () => {
  test("service_role은 상태 UPDATE 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await c.query("insert into public.email_log (id, to_email) values ('00000000-0000-0000-0000-00000000c001','x@y.com')");
      await asService(c);
      await c.query("update public.email_log set status='sent' where to_email='x@y.com'");
      await asPostgres(c);
      const r = await c.query("select status from public.email_log where to_email='x@y.com'");
      expect(r.rows[0].status).toBe("sent");
    });
  });

  test("email.send 보유자도 UPDATE는 불가 (워커 전용)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await c.query("insert into public.email_log (to_email) values ('x@y.com')");
      await asUser(c, UID.sales1);
      // UPDATE 정책 없음 → 0행 영향(RLS가 대상 행을 숨김)
      const r = await c.query("update public.email_log set status='sent' where to_email='x@y.com'");
      expect(r.rowCount).toBe(0);
    });
  });
});
