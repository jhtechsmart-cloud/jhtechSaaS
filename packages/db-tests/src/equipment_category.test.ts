import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cat-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cat-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
}

describe("equipment_category — 2단계 taxonomy RLS", () => {
  test("대분류·소분류 생성 성공(권한자)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      expect(p.rowCount).toBe(1);
      const child = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      expect(child.rowCount).toBe(1);
    });
  });
  test("3단계(손자) → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      const ch = await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'손자')", [ch.rows[0].id])).rejects.toThrow();
    });
  });
  test("자식 있는 대분류를 다른 대분류 하위로 이동 → 거부(손자 생성 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const a = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터')", [a.rows[0].id]);
      const b = await c.query("insert into public.equipment_category (name) values ('커팅기') returning id", []);
      // 자식(UV프린터)이 있는 '프린터'를 '커팅기' 하위로 이동 시도 → 손자 발생이므로 거부
      await expect(c.query("update public.equipment_category set parent_id=$1 where id=$2", [b.rows[0].id, a.rows[0].id])).rejects.toThrow();
    });
  });
  test("대분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await expect(c.query("insert into public.equipment_category (name) values ('프린터')", [])).rejects.toThrow();
    });
  });
  test("같은 부모 아래 소분류 동명 중복 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id])).rejects.toThrow();
    });
  });
  test("무권한 sales INSERT 거부 / 로그인 SELECT 허용 / anon 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.equipment_category (name) values ('금지')", [])).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      await asPostgres(c);
      await c.query("insert into public.equipment_category (name) values ('프린터')", []);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBeGreaterThan(0);
      await asAnon(c);
      expect((await c.query("select id from public.equipment_category")).rowCount).toBe(0);
    });
  });
  test("참조 있는 노드 삭제 차단(restrict): 소분류가 있으면 대분류 삭제 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV')", [p.rows[0].id]);
      await expect(c.query("delete from public.equipment_category where id=$1", [p.rows[0].id])).rejects.toThrow();
    });
  });
});

describe("equipment_category — quote_logo_kind(견적 로고 종류)", () => {
  test("대분류에 cutter/printer 설정 성공(권한자)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      const upd = await c.query("update public.equipment_category set quote_logo_kind='printer' where id=$1 returning quote_logo_kind", [p.rows[0].id]);
      expect(upd.rows[0].quote_logo_kind).toBe("printer");
      const cut = await c.query("insert into public.equipment_category (name, quote_logo_kind) values ('커팅기','cutter') returning quote_logo_kind", []);
      expect(cut.rows[0].quote_logo_kind).toBe("cutter");
    });
  });
  test("잘못된 값 → CHECK 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.equipment_category (name, quote_logo_kind) values ('잘못','foo')", [])).rejects.toThrow();
    });
  });
  test("소분류에 로고 종류 설정 → CHECK 거부(대분류 전용)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await expect(c.query("insert into public.equipment_category (parent_id,name,quote_logo_kind) values ($1,'UV','printer')", [p.rows[0].id])).rejects.toThrow();
    });
  });
  test("무권한 sales UPDATE 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      const p = await c.query("insert into public.equipment_category (name) values ('프린터') returning id", []);
      await asUser(c, UID.sales1);
      const upd = await c.query("update public.equipment_category set quote_logo_kind='printer' where id=$1 returning id", [p.rows[0].id]);
      // RLS UPDATE 정책(equipment.manage)에 막혀 0행 갱신.
      expect(upd.rowCount).toBe(0);
    });
  });
});
