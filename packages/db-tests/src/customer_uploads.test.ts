import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

describe("customer-uploads 버킷 RLS", () => {
  test("버킷 존재(private, 5MB, image 3종)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "select public, file_size_limit, allowed_mime_types from storage.buckets where id='customer-uploads'",
      );
      expect(r.rows[0].public).toBe(false);
      expect(Number(r.rows[0].file_size_limit)).toBe(5242880);
      expect(r.rows[0].allowed_mime_types).toEqual(
        expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]),
      );
    });
  });

  test("anon은 버킷-상대 <uuid>/<slot>.ext 경로로 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      // storage.test.ts와 동일한 (bucket_id, name) 컬럼 셋 사용
      await c.query(
        `insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`,
        ["00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg"],
      );
    });
  });

  test("anon은 형식 위반 경로(임의 name·traversal)로는 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      // 임의 경로 — 정책 name 정규식 위반
      await expect(
        c.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', 'x/anything.jpg')`),
      ).rejects.toThrow();
      // 허용되지 않은 슬롯명
      await expect(
        c.query(
          `insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`,
          ["00000000-0000-0000-0000-0000000000ff/evil_slot.jpg"],
        ),
      ).rejects.toThrow();
    });
  });

  test("권한 없는 로그인 사용자는 customer-uploads SELECT 불가", async () => {
    await inRollbackTx(c, async () => {
      // postgres 슈퍼유저로 오브젝트 삽입(RLS 우회)
      await asPostgres(c);
      await c.query(
        `insert into storage.objects (bucket_id, name) values ('customer-uploads', 'x/ext_entrance.jpg')`,
      );
      // sales2 = 권한 없는 인증 사용자
      await seedAuthUser(c, UID.sales2, "s2@x.com");
      await asUser(c, UID.sales2);
      const r = await c.query("select id from storage.objects where bucket_id='customer-uploads'");
      expect(r.rowCount).toBe(0);
    });
  });
});
