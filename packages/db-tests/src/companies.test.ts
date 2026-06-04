// companies RLS·CHECK·트리거 통합 테스트. E1 하니스 재사용.
// E5a: customers.manage(통합) → edit/delete/view_all 분해 + assignee 본인 스코프.
//   admin=users.manage(super), sales1=customers.edit(본인담당만), sales2=권한없음/타담당.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "cust-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "cust-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "cust-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{customers.edit}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
}

describe("companies — INSERT 권한 (customers.edit)", () => {
  test("customers.edit 보유자(sales1) INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.sales1);
      const r = await c.query("insert into public.companies (name,biz_no,assignee_id) values ('가나상사','1234567890',$1) returning id", [UID.sales1]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("admin(super) INSERT 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      const r = await c.query("insert into public.companies (name) values ('관리상사') returning id");
      expect(r.rowCount).toBe(1);
    });
  });
  test("권한 없는 sales2 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.sales2);
      await expect(c.query("insert into public.companies (name) values ('금지')")).rejects.toThrow();
    });
  });
});

describe("companies — SELECT 스코프 (본인 담당 OR customers.view_all)", () => {
  test("anon 직접 SELECT = 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name) values ('비밀상사')");
      await asAnon(c);
      expect((await c.query("select id from public.companies")).rowCount).toBe(0);
    });
  });
  test("sales1은 본인 담당 고객만 보고, 타인·미배정은 안 보인다", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name,assignee_id) values ('내고객',$1)", [UID.sales1]);
      await c.query("insert into public.companies (name,assignee_id) values ('남고객',$1)", [UID.sales2]);
      await c.query("insert into public.companies (name,assignee_id) values ('미배정',null)");
      await asUser(c, UID.sales1);
      const r = await c.query("select name from public.companies order by name");
      expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["내고객"]);
    });
  });
  test("admin(super)은 담당 무관 전체 조회", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name,assignee_id) values ('a',$1),('b',$2),('c',null)", [UID.sales1, UID.sales2]);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.companies")).rowCount).toBe(3);
    });
  });
  test("customers.view_all 보유자는 담당 무관 전체 조회", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{customers.view_all}' where id=$1", [UID.sales2]);
      await c.query("insert into public.companies (name,assignee_id) values ('a',$1),('b',null)", [UID.sales1]);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.companies")).rowCount).toBe(2);
    });
  });
});

describe("companies — UPDATE 스코프 (edit AND (본인 OR view_all))", () => {
  test("sales1은 본인 담당 고객 수정 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query("insert into public.companies (name,assignee_id) values ('내고객',$1) returning id", [UID.sales1]);
      await asUser(c, UID.sales1);
      const up = await c.query("update public.companies set name='수정됨' where id=$1 returning id", [r.rows[0].id]);
      expect(up.rowCount).toBe(1);
    });
  });
  test("sales1은 타인 담당 고객 수정 불가 (0행)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query("insert into public.companies (name,assignee_id) values ('남고객',$1) returning id", [UID.sales2]);
      await asUser(c, UID.sales1);
      const up = await c.query("update public.companies set name='탈취시도' where id=$1 returning id", [r.rows[0].id]);
      expect(up.rowCount).toBe(0);
    });
  });
  test("권한 없는 sales2 UPDATE 불가", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query("insert into public.companies (name,assignee_id) values ('x',$1) returning id", [UID.sales2]);
      await asUser(c, UID.sales2);
      const up = await c.query("update public.companies set name='y' where id=$1 returning id", [r.rows[0].id]);
      expect(up.rowCount).toBe(0);
    });
  });
});

describe("companies — DELETE 권한 (customers.delete, 관리자만)", () => {
  test("admin(super) 삭제 성공", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query("insert into public.companies (name) values ('지울사') returning id");
      await asUser(c, UID.admin);
      const del = await c.query("delete from public.companies where id=$1 returning id", [r.rows[0].id]);
      expect(del.rowCount).toBe(1);
    });
  });
  test("customers.edit만 가진 sales1은 본인 담당이어도 삭제 불가 (0행)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query("insert into public.companies (name,assignee_id) values ('내고객',$1) returning id", [UID.sales1]);
      await asUser(c, UID.sales1);
      const del = await c.query("delete from public.companies where id=$1 returning id", [r.rows[0].id]);
      expect(del.rowCount).toBe(0);
    });
  });
});

describe("companies — 제약·트리거", () => {
  test("biz_no 부분 UNIQUE: 중복 거부, NULL 복수 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asUser(c, UID.admin);
      await c.query("insert into public.companies (name,biz_no) values ('A','1234567890')");
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
        "insert into public.companies (name,source_application_id,assignee_id) values ('보존',$1,$2) returning id, created_at, source_application_id",
        [app.rows[0].id, UID.admin],
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
