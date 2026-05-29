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

async function setPerms(uid: string, perms: string[]): Promise<void> {
  await c.query("update public.profiles set permissions=$1 where id=$2", [perms, uid]);
}
async function hasPerm(uid: string | null, key: string): Promise<boolean> {
  const r = await c.query("select public.has_permission($1, $2) as ok", [uid, key]);
  return r.rows[0].ok;
}

describe("has_permission() — capability RLS 헬퍼", () => {
  test("단일 키 보유자는 해당 키만 true, 타 키는 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await setPerms(UID.sales1, ["quotes.write"]);
      expect(await hasPerm(UID.sales1, "quotes.write")).toBe(true);
      expect(await hasPerm(UID.sales1, "equipment.manage")).toBe(false);
    });
  });

  test("users.manage 보유자는 임의 키에 true (관리자 = 전체)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.admin, "admin@jhtech.test");
      await setPerms(UID.admin, ["users.manage"]);
      expect(await hasPerm(UID.admin, "equipment.manage")).toBe(true);
      expect(await hasPerm(UID.admin, "applications.view_all")).toBe(true);
    });
  });

  test("권한 없는 사용자는 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
      expect(await hasPerm(UID.sales2, "quotes.write")).toBe(false);
    });
  });

  test("null uid(anon)는 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      expect(await hasPerm(null, "quotes.write")).toBe(false);
    });
  });

  test("is_active=false 사용자는 권한 보유해도 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await setPerms(UID.sales1, ["quotes.write"]);
      await c.query("update public.profiles set is_active=false where id=$1", [UID.sales1]);
      expect(await hasPerm(UID.sales1, "quotes.write")).toBe(false);
    });
  });
});
