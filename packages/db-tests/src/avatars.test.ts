import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, asAnon, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// avatars 버킷 RLS(#1) — 본인 폴더만 쓰기, 타인 폴더 거부, 공개 읽기. + profiles.avatar_url.
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
}

describe("avatars 버킷 RLS", () => {
  test("본인 폴더(<uid>/...) 업로드 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query(
        "insert into storage.objects (bucket_id, name) values ('avatars', $1)",
        [`${UID.sales1}/avatar.png`],
      );
      const r = await c.query("select count(*)::int n from storage.objects where name=$1", [`${UID.sales1}/avatar.png`]);
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("타인 폴더 업로드 거부(RLS)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${UID.sales2}/avatar.png`]),
      ).rejects.toThrow();
    });
  });

  test("공개 읽기 — anon도 조회 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${UID.sales1}/avatar.png`]);
      await asAnon(c);
      const r = await c.query("select count(*)::int n from storage.objects where bucket_id='avatars' and name=$1", [`${UID.sales1}/avatar.png`]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});

describe("profiles.avatar_url", () => {
  test("users.manage 없이는 본인 행도 RLS UPDATE 불가(→ 앱은 admin 클라 사용)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1); // 권한 없음
      const r = await c.query("update public.profiles set avatar_url=$1 where id=$2", ["x/y.png", UID.sales1]);
      expect(r.rowCount).toBe(0); // RLS로 0행 영향(본인 행이라도 users.manage 없으면 불가)
    });
  });

  test("service_role(앱 admin 클라)은 본인 행 avatar_url 저장 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
      // service_role = RLS 우회(앱 setAvatarAction이 id=auth.uid()로 제한).
      await c.query("update public.profiles set avatar_url=$1 where id=$2", [`${UID.sales1}/avatar.png`, UID.sales1]);
      const r = await c.query("select avatar_url from public.profiles where id=$1", [UID.sales1]);
      expect(r.rows[0].avatar_url).toBe(`${UID.sales1}/avatar.png`);
    });
  });
});
