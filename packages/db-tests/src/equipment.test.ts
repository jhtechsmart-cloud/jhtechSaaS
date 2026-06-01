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

const EQ_ACTIVE = "00000000-0000-0000-0000-0000000000e1";
const EQ_INACTIVE = "00000000-0000-0000-0000-0000000000e2";

async function seedEquipment(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test"); // 권한 없음
  await seedAuthUser(c, UID.admin, "eq@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
  await c.query(
    "insert into public.equipment (id,name,base_price,status,youtube_urls) values ($1,'활성장비',5000,'active','{\"https://youtu.be/x\"}'),($2,'비활성장비',7000,'inactive','{}')",
    [EQ_ACTIVE, EQ_INACTIVE],
  );
}

describe("equipment — RLS", () => {
  test("authenticated는 전 장비를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.equipment");
      expect(r.rowCount).toBe(2);
    });
  });

  test("anon은 equipment 원본 테이블을 못 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asAnon(c);
      const r = await c.query("select id from public.equipment");
      expect(r.rowCount).toBe(0);
    });
  });

  test("equipment.manage 없는 사용자는 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.equipment (name,base_price) values ('x',1)"),
      ).rejects.toThrow();
    });
  });

  test("equipment.manage 보유자는 INSERT/UPDATE 가능", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.admin);
      await c.query("insert into public.equipment (name,base_price) values ('새장비',9)");
      await c.query("update public.equipment set base_price=10 where id=$1", [EQ_ACTIVE]);
      const r = await c.query("select count(*)::int n from public.equipment");
      expect(r.rows[0].n).toBe(3);
    });
  });
});

describe("equipment_public — 공개 뷰 (D5: 가격 비노출, active만)", () => {
  test("anon은 active 장비만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asAnon(c);
      const r = await c.query("select id from public.equipment_public");
      expect(r.rows.map((x) => x.id)).toEqual([EQ_ACTIVE]);
    });
  });

  test("공개 뷰에 base_price 컬럼이 없다 (가격 비노출)", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asAnon(c);
      const r = await c.query("select * from public.equipment_public limit 1");
      const cols = r.fields.map((f) => f.name);
      expect(cols).not.toContain("base_price");
      expect(cols).not.toContain("youtube_url");
      expect(cols).toContain("youtube_urls");
      expect(cols).toContain("specs");
    });
  });
});

describe("equipment — M2 P-A 컬럼 구조", () => {
  test("equipment_public 뷰가 highlights·youtube_urls 노출, youtube_url 컬럼 없음", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const cols = await c.query(
        "select column_name from information_schema.columns where table_name='equipment_public'",
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toContain("highlights");
      expect(names).toContain("youtube_urls");
      expect(names).not.toContain("youtube_url");
    });
  });

  test("equipment 본 테이블에 highlights·youtube_urls 존재, youtube_url 제거됨", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const cols = await c.query(
        "select column_name from information_schema.columns where table_name='equipment' and table_schema='public'",
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toContain("highlights");
      expect(names).toContain("youtube_urls");
      expect(names).not.toContain("youtube_url");
    });
  });
});

describe("equipment_option — RLS", () => {
  test("equipment.manage 없는 사용자는 옵션 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.equipment_option (equipment_id,kind,name,price) values ($1,'extra','옵션',1)", [EQ_ACTIVE]),
      ).rejects.toThrow();
    });
  });
});
