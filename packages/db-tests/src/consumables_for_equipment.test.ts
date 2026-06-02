import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 테스트용 장비 고정 UUID
const EQ_A = "00000000-0000-0000-0000-0000000000e1"; // UV프린터A
const EQ_B = "00000000-0000-0000-0000-0000000000e2"; // 커팅기B

/**
 * 테스트 픽스처 생성.
 * - UV잉크: 분류 'UV프린터' 공통
 * - 세정액: 분류 'UV프린터' + '커팅기' 양쪽
 * - A전용부품: 장비 EQ_A 직접
 * - 단종잉크: 분류 'UV프린터'지만 inactive → 결과 제외 대상
 */
async function seed(): Promise<{ ink: string; clean: string; blade: string; inactive: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cfe-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'UV프린터A','UV프린터',1000,'active')", [EQ_A]);
  await c.query("insert into public.equipment (id,name,category,base_price,status) values ($1,'커팅기B','커팅기',1000,'active')", [EQ_B]);
  const ink = (await c.query("insert into public.consumables (name) values ('UV잉크') returning id", [])).rows[0].id as string;
  const clean = (await c.query("insert into public.consumables (name) values ('세정액') returning id", [])).rows[0].id as string;
  const blade = (await c.query("insert into public.consumables (name) values ('A전용부품') returning id", [])).rows[0].id as string;
  const inactive = (await c.query("insert into public.consumables (name,status) values ('단종잉크','inactive') returning id", [])).rows[0].id as string;
  // UV잉크 → 분류 'UV프린터' 공통 매핑
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [ink]);
  // 세정액 → 분류 'UV프린터' + '커팅기' 양쪽 매핑
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [clean]);
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'커팅기')", [clean]);
  // A전용부품 → 장비 EQ_A 직접 매핑
  await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [blade, EQ_A]);
  // 단종잉크 → 분류 'UV프린터'이지만 status=inactive → 함수 결과 제외
  await c.query("insert into public.consumable_scope (consumable_id,category) values ($1,'UV프린터')", [inactive]);
  return { ink, clean, blade, inactive };
}

describe("consumables_for_equipment — 분류공통 + 장비전용 dedup·active", () => {
  test("UV프린터A → UV잉크·세정액·A전용부품(active), 단종 제외", async () => {
    await inRollbackTx(c, async () => {
      const { inactive } = await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1) order by name", [EQ_A]);
      const names = r.rows.map((x: { name: string }) => x.name);
      expect(names.sort()).toEqual(["A전용부품", "UV잉크", "세정액"].sort());
      expect(names).not.toContain("단종잉크");
      const ids = (await c.query("select id from public.consumables_for_equipment($1)", [EQ_A])).rows.map((x: { id: string }) => x.id);
      expect(ids).not.toContain(inactive);
    });
  });

  test("커팅기B → 세정액만(분류 '커팅기' 공통)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_B]);
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["세정액"]);
    });
  });

  test("매핑 중복 없이 1행으로 dedup (세정액이 분류·장비 양쪽 매핑돼도 1건)", async () => {
    await inRollbackTx(c, async () => {
      const { clean } = await seed();
      await asUser(c, UID.admin);
      // 세정액을 EQ_A 장비 직접 매핑에도 추가 → category + equipment_id 양쪽 매핑 상태
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [clean, EQ_A]);
      const r = await c.query("select id from public.consumables_for_equipment($1) where id=$2", [EQ_A, clean]);
      expect(r.rowCount).toBe(1);
    });
  });
});
