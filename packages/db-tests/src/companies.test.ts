// companies RLS·CHECK·트리거 통합 테스트. E1 하니스 재사용.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cust-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cust-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.sales1]);
}

describe("companies — customers.manage 게이트", () => {
  test("보유자 INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.companies (name,biz_no) values ('가나상사','1234567890') returning id");
      expect(r.rowCount).toBe(1);
    });
  });
  test("미보유 sales INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.sales1);
      await expect(c.query("insert into public.companies (name) values ('금지')")).rejects.toThrow();
    });
  });
  test("anon 직접 SELECT = 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name) values ('비밀상사')");
      await asAnon(c);
      const r = await c.query("select id from public.companies");
      expect(r.rowCount).toBe(0);
    });
  });
  test("authenticated 전원 SELECT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name) values ('공개상사')");
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.companies");
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("companies — 제약·트리거", () => {
  test("biz_no 부분 UNIQUE: 중복 거부, NULL 복수 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.companies (name,biz_no) values ('A','1234567890')");
      // SAVEPOINT로 에러를 격리 — Postgres는 에러 후 txn이 ABORTED가 되므로
      // 같은 트랜잭션 내 후속 쿼리를 실행하려면 savepoint/rollback to 필요.
      await c.query("savepoint sp1");
      await expect(c.query("insert into public.companies (name,biz_no) values ('B','1234567890')")).rejects.toThrow();
      await c.query("rollback to savepoint sp1");
      const r = await c.query("insert into public.companies (name) values ('C'),('D') returning id");
      expect(r.rowCount).toBe(2);
    });
  });
  test("biz_no 형식 CHECK: 10자리 아니면 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await expect(c.query("insert into public.companies (name,biz_no) values ('X','12345')")).rejects.toThrow();
    });
  });
  test("created_at·source_application_id UPDATE 불변(트리거)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const app = await c.query("insert into public.applications (company) values ('출처') returning id");
      const ins = await c.query(
        "insert into public.companies (name,source_application_id) values ('보존',$1) returning id, created_at, source_application_id",
        [app.rows[0].id],
      );
      const { id, created_at, source_application_id } = ins.rows[0];
      await asUser(c, UID.admin);
      await c.query("update public.companies set created_at='2000-01-01', source_application_id=null, name='바뀜' where id=$1", [id]);
      await asPostgres(c);
      const after = await c.query("select created_at, source_application_id, name from public.companies where id=$1", [id]);
      expect(after.rows[0].created_at.toISOString()).toBe(created_at.toISOString());
      expect(after.rows[0].source_application_id).toBe(source_application_id);
      expect(after.rows[0].name).toBe("바뀜");
    });
  });
});
