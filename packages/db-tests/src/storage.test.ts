import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asAnon,
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

// sales1=equipment.manage, sales2=권한없음, admin=quotes.write
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.admin]);
}

describe("storage 버킷 (D4)", () => {
  test("equipment-images=public, quote-pdfs=private 버킷이 존재", async () => {
    const r = await c.query(
      "select id, public from storage.buckets where id in ('equipment-images','quote-pdfs') order by id",
    );
    expect(r.rows).toEqual([
      { id: "equipment-images", public: true },
      { id: "quote-pdfs", public: false },
    ]);
  });
});

describe("equipment-images — 공개 읽기, 쓰기는 equipment.manage", () => {
  test("equipment.manage 보유자는 업로드(INSERT object) 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into storage.objects (bucket_id, name) values ('equipment-images','a.jpg')");
      await asPostgres(c);
      const r = await c.query("select count(*)::int n from storage.objects where bucket_id='equipment-images'");
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("권한 없는 사용자는 업로드 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query("insert into storage.objects (bucket_id, name) values ('equipment-images','b.jpg')"),
      ).rejects.toThrow();
    });
  });

  test("anon은 공개 이미지 SELECT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into storage.objects (bucket_id, name) values ('equipment-images','c.jpg')");
      await asAnon(c);
      const r = await c.query("select name from storage.objects where bucket_id='equipment-images'");
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("quote-pdfs — 비공개, 워커 쓰기 / 스태프 읽기", () => {
  test("service_role(워커)은 업로드 가능", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      await c.query("insert into storage.objects (bucket_id, name) values ('quote-pdfs','q.pdf')");
      await asPostgres(c);
      const r = await c.query("select count(*)::int n from storage.objects where bucket_id='quote-pdfs'");
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("authenticated는 quote-pdfs에 업로드 불가 (워커 전용)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin); // quotes.write 보유해도 업로드 불가
      await expect(
        c.query("insert into storage.objects (bucket_id, name) values ('quote-pdfs','x.pdf')"),
      ).rejects.toThrow();
    });
  });

  test("quotes.write 보유자는 읽기 가능, anon은 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query("insert into storage.objects (bucket_id, name) values ('quote-pdfs','z.pdf')");
      await asUser(c, UID.admin);
      expect((await c.query("select name from storage.objects where bucket_id='quote-pdfs'")).rowCount).toBe(1);
      await asAnon(c);
      expect((await c.query("select name from storage.objects where bucket_id='quote-pdfs'")).rowCount).toBe(0);
    });
  });
});
