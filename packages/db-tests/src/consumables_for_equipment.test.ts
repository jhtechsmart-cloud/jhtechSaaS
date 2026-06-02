import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 테스트용 고정 장비 UUID
const EQ_UV = "00000000-0000-0000-0000-0000000000e1"; // UV프린터(소분류)
const EQ_SOL = "00000000-0000-0000-0000-0000000000e2"; // 솔벤트(소분류)
const EQ_CUT = "00000000-0000-0000-0000-0000000000e3"; // 커팅기(단독 대분류)

/** 시드: 분류 2단계(프린터>UV프린터·솔벤트, 커팅기 단독) + 장비 3개 + 소모품 4개 + 매핑 */
async function seed() {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cfe-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{consumables.manage}' where id=$1", [UID.admin]);
  // 분류 삽입
  const printer = (await c.query("insert into public.equipment_category (name) values ('프린터') returning id", [])).rows[0].id;
  const uv = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [printer])).rows[0].id;
  const sol = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'솔벤트') returning id", [printer])).rows[0].id;
  const cut = (await c.query("insert into public.equipment_category (name) values ('커팅기') returning id", [])).rows[0].id;
  // 장비 삽입
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UVA',$2,1,'active')", [EQ_UV, uv]);
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'SOLA',$2,1,'active')", [EQ_SOL, sol]);
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'CUTA',$2,1,'active')", [EQ_CUT, cut]);
  // 소모품 삽입
  const ink = (await c.query("insert into public.consumables (name) values ('UV잉크') returning id", [])).rows[0].id;
  const clean = (await c.query("insert into public.consumables (name) values ('세정액') returning id", [])).rows[0].id;
  const blade = (await c.query("insert into public.consumables (name) values ('칼날') returning id", [])).rows[0].id;
  const dead = (await c.query("insert into public.consumables (name,status) values ('단종','inactive') returning id", [])).rows[0].id;
  // 매핑: UV잉크→소분류UV / 세정액→대분류프린터(공통) / 칼날→대분류커팅기 / 단종→대분류프린터(inactive)
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [ink, uv]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, printer]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [blade, cut]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [dead, printer]);
  return { ink, clean, blade, dead };
}

describe("consumables_for_equipment — 대분류 커버·소분류·단독대분류·dedup·active", () => {
  test("UV프린터 장비 → UV잉크(소분류) + 세정액(대분류 프린터 공통), 단종 제외", async () => {
    await inRollbackTx(c, async () => {
      const { dead } = await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1) order by name", [EQ_UV]);
      expect(r.rows.map((x: { name: string }) => x.name).sort()).toEqual(["UV잉크", "세정액"].sort());
      const ids = (await c.query("select id from public.consumables_for_equipment($1)", [EQ_UV])).rows.map((x: { id: string }) => x.id);
      expect(ids).not.toContain(dead);
    });
  });
  test("솔벤트 장비 → 세정액만(대분류 프린터 공통, UV잉크는 다른 소분류라 제외)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_SOL]);
      expect(r.rows.map((x: { name: string }) => x.name).sort()).toEqual(["세정액"].sort());
    });
  });
  test("커팅기 장비(단독 대분류) → 칼날만", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_CUT]);
      expect(r.rows.map((x: { name: string }) => x.name).sort()).toEqual(["칼날"].sort());
    });
  });
  test("분류 미지정(category_id NULL) 장비 → 직접 매핑만 (분류 매칭 없음)", async () => {
    await inRollbackTx(c, async () => {
      const { clean } = await seed(); await asUser(c, UID.admin);
      // 분류 없는 장비 + 그 장비에 직접 매핑한 소모품
      const EQ_NONE = "00000000-0000-0000-0000-0000000000e9";
      await asPostgres(c);
      await c.query("insert into public.equipment (id,name,base_price,status) values ($1,'분류없음장비',1,'active')", [EQ_NONE]);
      const direct = (await c.query("insert into public.consumables (name) values ('직접부품') returning id", [])).rows[0].id;
      await c.query("insert into public.consumable_scope (consumable_id,equipment_id) values ($1,$2)", [direct, EQ_NONE]);
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.consumables_for_equipment($1)", [EQ_NONE]);
      // 직접부품만. 세정액(대분류 프린터)은 이 장비 분류가 없으므로 매칭 안 됨.
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["직접부품"]);
      expect(r.rows.map((x: { name: string }) => x.name)).not.toContain("세정액");
      void clean;
    });
  });
  test("dedup: 소분류+대분류 양쪽 매핑돼도 1행", async () => {
    await inRollbackTx(c, async () => {
      const { clean } = await seed(); await asUser(c, UID.admin);
      const uv = (await c.query("select category_id from public.equipment where id=$1", [EQ_UV])).rows[0].category_id;
      // 세정액을 소분류(UV)에도 추가 → 대분류+소분류 양쪽 매핑
      await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, uv]);
      const r = await c.query("select id from public.consumables_for_equipment($1) where id=$2", [EQ_UV, clean]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("anon 호출 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      await expect(c.query("select * from public.consumables_for_equipment($1)", [EQ_UV])).rejects.toThrow(/permission denied/);
    });
  });
});
