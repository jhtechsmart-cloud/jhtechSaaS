// equipment_option CRUD RLS — equipment.manage 유무별 쓰기 차단(AC7 보안 토대).
// E1 하니스(inRollbackTx + asUser/asAnon/asPostgres + UID)를 그대로 재사용한다.
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

const EQ = "00000000-0000-0000-0000-0000000000f1";

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "os1@jhtech.test"); // 권한 없음
  await seedAuthUser(c, UID.admin, "oeq@jhtech.test"); // equipment.manage
  await c.query(
    "update public.profiles set permissions='{equipment.manage}' where id=$1",
    [UID.admin],
  );
  await c.query(
    "insert into public.equipment (id,name,base_price,status) values ($1,'옵션장비',1000,'active')",
    [EQ],
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// equipment.manage 보유자(admin) — INSERT / UPDATE / DELETE 모두 허용
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment_option — equipment.manage 보유자(admin)", () => {
  test("INSERT/UPDATE/DELETE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const ins = await c.query(
        "insert into public.equipment_option (equipment_id,kind,name,price) values ($1,'included','받침대',0) returning id",
        [EQ],
      );
      expect(ins.rowCount).toBe(1);
      const optId = ins.rows[0].id;
      const upd = await c.query(
        "update public.equipment_option set price=500 where id=$1",
        [optId],
      );
      expect(upd.rowCount).toBe(1);
      const del = await c.query(
        "delete from public.equipment_option where id=$1",
        [optId],
      );
      expect(del.rowCount).toBe(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// equipment.manage 없는 로그인 사용자(sales1) — INSERT 에러, UPDATE/DELETE 0행
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment_option — 권한 없는 로그인 사용자(sales1)", () => {
  // INSERT: WITH CHECK 실패 → Postgres가 에러를 발생시킨다 (policy violation)
  test("INSERT 차단(RLS) — 에러 발생", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(
        c.query(
          "insert into public.equipment_option (equipment_id,kind,name,price) values ($1,'extra','호퍼',100)",
          [EQ],
        ),
      ).rejects.toThrow();
    });
  });

  // UPDATE/DELETE: USING 절로 행이 보이지 않아 영향 행 0개가 된다
  test("UPDATE/DELETE 차단(RLS) — 영향 행 0개", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      // postgres 역할로 fixture 삽입(RLS 우회)
      await asPostgres(c);
      const r = await c.query(
        "insert into public.equipment_option (equipment_id,kind,name,price) values ($1,'included','x',0) returning id",
        [EQ],
      );
      const optId = r.rows[0].id;
      await asUser(c, UID.sales1);
      const upd = await c.query(
        "update public.equipment_option set price=999 where id=$1",
        [optId],
      );
      expect(upd.rowCount).toBe(0);
      const del = await c.query(
        "delete from public.equipment_option where id=$1",
        [optId],
      );
      expect(del.rowCount).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// anon — equipment_option 원본 SELECT = 0건(정책 없음 → 전체 차단)
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment_option — 미인증(anon)", () => {
  test("SELECT 0건(원본 비공개)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query(
        "insert into public.equipment_option (equipment_id,kind,name,price) values ($1,'included','x',0)",
        [EQ],
      );
      await asAnon(c);
      const r = await c.query(
        "select * from public.equipment_option where equipment_id=$1",
        [EQ],
      );
      expect(r.rowCount).toBe(0);
    });
  });
});
