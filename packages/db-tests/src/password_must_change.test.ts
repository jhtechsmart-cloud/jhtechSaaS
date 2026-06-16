// 비밀번호 변경 기능 — must_change_password 컬럼 기본값 + RLS 검증.
// 일반 직원은 본인 must_change_password를 직접 끌 수 없어야 한다(profiles_update=users.manage).
// 관리자(users.manage)는 타인의 플래그를 변경할 수 있어야 한다.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "pw-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "pw-sales1@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}', is_active=true where id=$1", [UID.admin]);
  await c.query(
    "update public.profiles set permissions='{customers.edit}', is_active=true, must_change_password=true where id=$1",
    [UID.sales1],
  );
}

describe("must_change_password 컬럼", () => {
  test("신규 profiles 기본값은 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "pw-sales2@jhtech.test");
      const r = await c.query("select must_change_password from public.profiles where id=$1", [UID.sales2]);
      expect(r.rows[0].must_change_password).toBe(false);
    });
  });

  test("일반 직원은 본인 must_change_password를 직접 끌 수 없다(RLS 0행)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.profiles set must_change_password=false where id=$1 returning id",
        [UID.sales1],
      );
      // profiles_update 정책이 users.manage만 허용 → 본인 행도 UPDATE 불가 → 0행.
      expect(r.rowCount).toBe(0);
    });
  });

  test("관리자(users.manage)는 타인의 must_change_password를 변경할 수 있다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.profiles set must_change_password=true where id=$1 returning id",
        [UID.sales1],
      );
      expect(r.rowCount).toBe(1);
    });
  });
});
