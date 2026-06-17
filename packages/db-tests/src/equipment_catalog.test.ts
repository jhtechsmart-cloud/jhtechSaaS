import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, inRollbackTx, makeClient } from "./helpers";

// 장비 카탈로그 — equipment.catalog_pdf 경로 CHECK + equipment-catalogs 공개 버킷.
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const UUID = "11111111-1111-1111-1111-111111111111";

describe("equipment.catalog_pdf CHECK", () => {
  test("올바른 경로 허용", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const r = await c.query(
        `insert into public.equipment (id, name, catalog_pdf) values ($1,'장비',$2) returning id`,
        [UUID, `equipment/${UUID}/catalog.pdf`],
      );
      expect(r.rowCount).toBe(1);
    });
  });
  test("잘못된 경로 거부", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      await expect(
        c.query(`insert into public.equipment (id, name, catalog_pdf) values ($1,'장비','equipment/x/bad.pdf')`, [UUID]),
      ).rejects.toThrow();
    });
  });
  test("null 허용", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const r = await c.query(`insert into public.equipment (id, name) values ($1,'장비') returning id`, [UUID]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("equipment-catalogs 버킷", () => {
  test("공개 버킷 + pdf mime 등록됨", async () => {
    await asPostgres(c);
    const r = await c.query(`select public, allowed_mime_types from storage.buckets where id='equipment-catalogs'`);
    expect(r.rows[0]?.public).toBe(true);
    expect(r.rows[0]?.allowed_mime_types).toContain("application/pdf");
  });
});
