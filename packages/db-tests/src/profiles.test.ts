import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asAnon,
  asPostgres,
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

describe("profiles — auth.users 트리거", () => {
  test("auth.users INSERT 시 profiles 행이 자동 생성된다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "sales1@jhtech.test");

      const r = await c.query(
        "select id, name, permissions, is_active from public.profiles where id=$1",
        [UID.sales1],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].name).toBe("sales1@jhtech.test");
      expect(r.rows[0].permissions).toEqual([]);
      expect(r.rows[0].is_active).toBe(true);
    });
  });
});

describe("profiles — RLS 가시성", () => {
  async function seedThree(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.admin, "admin@jhtech.test");
    await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
    await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  }

  test("일반 사용자는 자기 profile만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedThree();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.profiles");
      expect(r.rows.map((x) => x.id)).toEqual([UID.sales1]);
    });
  });

  test("users.manage 보유자는 타인 profile까지 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedThree();
      await asUser(c, UID.admin);
      // 전역 DB 상태(시드 잔존행)에 의존하지 않도록 시드한 3개 UID만 조회 →
      // 관리자가 자기 외 sales1·sales2 profile도 본다는 걸 증명.
      const r = await c.query(
        "select id from public.profiles where id = any($1::uuid[])",
        [[UID.admin, UID.sales1, UID.sales2]],
      );
      expect(r.rowCount).toBe(3);
    });
  });

  test("anon은 profile을 전혀 못 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedThree();
      await asAnon(c);
      const r = await c.query("select id from public.profiles");
      expect(r.rowCount).toBe(0);
    });
  });
});
