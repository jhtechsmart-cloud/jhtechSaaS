// E5a /review 후속 — profiles 자가 락아웃 방어 트리거(방어심화).
// 앱 가드(updateUserPermissions/setUserActive)가 UI를 막지만, 직접 PostgREST PATCH로
// 본인 users.manage 회수·본인 비활성화가 RLS상 가능했다 → BEFORE UPDATE 트리거로 DB레벨 차단.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seedAdmin(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "lock-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "lock-sales1@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{customers.edit}', is_active=true where id=$1", [UID.sales1]);
}

describe("profiles 자가 락아웃 방어 트리거", () => {
  test("관리자가 본인 users.manage를 회수하면 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedAdmin();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.profiles set permissions='{customers.edit}' where id=$1", [UID.admin]),
      ).rejects.toThrow();
    });
  });

  test("관리자가 본인 계정을 비활성화하면 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedAdmin();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.profiles set is_active=false where id=$1", [UID.admin]),
      ).rejects.toThrow();
    });
  });

  test("관리자가 본인의 다른 컬럼(이름)·권한 추가는 허용", async () => {
    await inRollbackTx(c, async () => {
      await seedAdmin();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.profiles set permissions='{users.manage,customers.edit}' where id=$1 returning id",
        [UID.admin],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  test("관리자가 타인(sales1)의 users.manage 회수·비활성화는 허용", async () => {
    await inRollbackTx(c, async () => {
      await seedAdmin();
      // sales1에게 users.manage 부여 후 admin이 회수
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.sales1]);
      await asUser(c, UID.admin);
      const r1 = await c.query(
        "update public.profiles set permissions='{customers.edit}' where id=$1 returning id",
        [UID.sales1],
      );
      expect(r1.rowCount).toBe(1);
      const r2 = await c.query(
        "update public.profiles set is_active=false where id=$1 returning id",
        [UID.sales1],
      );
      expect(r2.rowCount).toBe(1);
    });
  });

  test("service_role(auth.uid() NULL)은 본인 판정 미적용 — 시드/워커 무영향", async () => {
    await inRollbackTx(c, async () => {
      await seedAdmin();
      await asService(c);
      // service_role은 auth.uid()가 NULL → NEW.id=uid 불성립 → 트리거 통과
      const r = await c.query(
        "update public.profiles set permissions='{customers.edit}' where id=$1 returning id",
        [UID.admin],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
