// equipment CRUD RLS 통합 테스트
// equipment.manage 권한 유무에 따른 INSERT / UPDATE / DELETE 차단 검증
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

const EQ_ACTIVE = "00000000-0000-0000-0000-0000000000e1";
const EQ_INACTIVE = "00000000-0000-0000-0000-0000000000e2";

// equipment.test.ts 와 동일한 시드 함수 — 트랜잭션 안에서만 실행됨(ROLLBACK으로 정리)
async function seedEquipment(): Promise<void> {
  await asPostgres(c);
  // sales1: 권한 없음, admin: equipment.manage 보유
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.admin, "eq@jhtech.test");
  await c.query(
    "update public.profiles set permissions='{equipment.manage}' where id=$1",
    [UID.admin],
  );
  await c.query(
    "insert into public.equipment (id,name,base_price,status,youtube_urls) values ($1,'활성장비',5000,'active','{\"https://youtu.be/x\"}'),($2,'비활성장비',7000,'inactive','{}')",
    [EQ_ACTIVE, EQ_INACTIVE],
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// equipment.manage 보유자(UID.admin) — INSERT / UPDATE / DELETE 모두 허용
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment CRUD — equipment.manage 보유자", () => {
  test("INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.admin);
      const r = await c.query(
        "insert into public.equipment (name,base_price) values ('새장비',9999) returning id",
      );
      expect(r.rowCount).toBe(1);
    });
  });

  test("UPDATE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.equipment set base_price=8888 where id=$1",
        [EQ_ACTIVE],
      );
      expect(r.rowCount).toBe(1);
    });
  });

  test("DELETE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.admin);
      const r = await c.query("delete from public.equipment where id=$1", [
        EQ_ACTIVE,
      ]);
      expect(r.rowCount).toBe(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// equipment.manage 없는 사용자(UID.sales1) — INSERT / UPDATE / DELETE 차단
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment CRUD — equipment.manage 없는 사용자", () => {
  // INSERT: WITH CHECK 실패 → Postgres가 에러를 발생시킨다 (policy violation)
  test("INSERT 거부 — 에러 발생", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.equipment (name,base_price) values ('금지장비',1)"),
      ).rejects.toThrow();
    });
  });

  // UPDATE: USING 절이 없는 행을 보이지 않게 만들어 업데이트 대상 행이 0개가 된다
  test("UPDATE 차단 — 영향 행 0개", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.equipment set base_price=1 where id=$1",
        [EQ_ACTIVE],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  // DELETE: USING 절로 대상 행이 보이지 않아 삭제 행이 0개가 된다
  test("DELETE 차단 — 영향 행 0개", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asUser(c, UID.sales1);
      const r = await c.query("delete from public.equipment where id=$1", [
        EQ_ACTIVE,
      ]);
      expect(r.rowCount).toBe(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// anon — equipment 원본 테이블 SELECT = 0행, equipment_public = active만 노출
// ──────────────────────────────────────────────────────────────────────────────
describe("equipment SELECT — anon 접근 제한", () => {
  test("anon은 equipment 원본 테이블을 못 본다 (정책 없음 → 0행)", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asAnon(c);
      const r = await c.query("select id from public.equipment");
      expect(r.rowCount).toBe(0);
    });
  });

  test("anon은 equipment_public 뷰에서 active 행만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipment();
      await asAnon(c);
      const r = await c.query("select id from public.equipment_public");
      expect(r.rows.map((x) => x.id)).toEqual([EQ_ACTIVE]);
    });
  });
});
