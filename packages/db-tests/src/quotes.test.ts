import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
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

const APP = "00000000-0000-0000-0000-00000000a001";

// 부모 application + 영업 사용자들 시드. sales1=quotes.write, sales2=권한없음, admin=view_all.
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
  await c.query("insert into public.applications (id, company) values ($1,'견적대상')", [APP]);
}

describe("quotes — 버전 UNIQUE 제약 (E-3)", () => {
  test("UNIQUE(application_id, version) 안전망 — 트리거 우회 시에도 중복 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      // 평시엔 quotes_server_fields 트리거가 version을 자동 채번해 중복이 안 생긴다.
      // 제약 자체(트리거 뒤의 안전망)를 검증하려고 트리거를 잠시 끄고 같은 version을
      // 강제 삽입 → UNIQUE가 거부해야 한다. (DDL은 트랜잭션이라 rollback으로 원복)
      await c.query("alter table public.quotes disable trigger quotes_server_fields");
      await c.query("insert into public.quotes (application_id, quote_no, version) values ($1,'QT-1',1)", [APP]);
      await expect(
        c.query("insert into public.quotes (application_id, quote_no, version) values ($1,'QT-1b',1)", [APP]),
      ).rejects.toThrow();
    });
  });
});

describe("quotes — RLS 쓰기 권한", () => {
  test("quotes.write 없는 사용자는 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query("insert into public.quotes (application_id, quote_no, version, assignee_id) values ($1,'QT-x',1,$2)", [APP, UID.sales2]),
      ).rejects.toThrow();
    });
  });

  test("quotes.write 보유자는 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into public.quotes (application_id, quote_no, version, assignee_id) values ($1,'QT-y',1,$2)", [APP, UID.sales1]);
      await asPostgres(c);
      const r = await c.query("select count(*)::int n from public.quotes where application_id=$1", [APP]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});

describe("quotes — RLS SELECT scope", () => {
  async function seedQuote(): Promise<void> {
    await seed();
    await c.query("insert into public.quotes (application_id, quote_no, version, assignee_id) values ($1,'QT-z',1,$2)", [APP, UID.sales1]);
  }

  test("배정된 본인은 자기 quote를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedQuote();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.quotes");
      expect(r.rowCount).toBe(1);
    });
  });

  test("비배정 영업은 타인 quote를 못 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedQuote();
      await asUser(c, UID.sales2);
      const r = await c.query("select id from public.quotes");
      expect(r.rowCount).toBe(0);
    });
  });

  test("applications.view_all 보유자는 전체 quote를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedQuote();
      await asUser(c, UID.admin);
      const r = await c.query("select id from public.quotes");
      expect(r.rowCount).toBe(1);
    });
  });
});
