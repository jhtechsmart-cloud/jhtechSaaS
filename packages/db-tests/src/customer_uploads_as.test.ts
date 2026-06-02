// M2 P-D #22 — customer-uploads 버킷 A/S 슬롯 확장(as_photo_1..3) + service_requests.view_all read.
// RPC photos 슬롯 정규식과 동일집합(end-to-end 정합). 기존 견적 슬롯은 회귀 없이 유지.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("customer-uploads — A/S 슬롯 확장", () => {
  test("anon은 <uuid>/as_photo_1..3.ext 로 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      for (const slot of ["as_photo_1", "as_photo_2", "as_photo_3"]) {
        await c.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [
          `00000000-0000-0000-0000-0000000000ff/${slot}.jpg`,
        ]);
      }
    });
  });

  test("anon은 as_photo_4(미허용 슬롯)로는 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [
          "00000000-0000-0000-0000-0000000000ff/as_photo_4.jpg",
        ]),
      ).rejects.toThrow();
    });
  });

  test("기존 견적 슬롯(ext_entrance)은 회귀 없이 유지", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [
        "00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg",
      ]);
    });
  });

  test("service_requests.view_all 보유자는 customer-uploads SELECT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [
        "00000000-0000-0000-0000-0000000000ff/as_photo_1.jpg",
      ]);
      await seedAuthUser(c, UID.admin, "sr-up-admin@jhtech.test");
      await c.query("update public.profiles set permissions='{service_requests.view_all}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const r = await c.query("select id from storage.objects where bucket_id='customer-uploads'");
      expect(r.rowCount).toBe(1);
    });
  });
});
