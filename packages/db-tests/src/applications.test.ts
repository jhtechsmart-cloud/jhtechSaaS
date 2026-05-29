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

describe("applications — seq_no 채번 (전역 sequence)", () => {
  test("INSERT 시 seq_no가 REQ-YYYYMMDD-NNNNN 형식으로 자동 생성", async () => {
    await inRollbackTx(c, async () => {
      // anon은 SELECT 금지(설계) → RETURNING 불가. 삽입 후 postgres로 읽어 검증.
      await asAnon(c);
      await c.query("insert into public.applications (company) values ('테스트상사')");
      await asPostgres(c);
      const r = await c.query(
        "select seq_no from public.applications where company='테스트상사'",
      );
      expect(r.rows[0].seq_no).toMatch(/^REQ-\d{8}-\d{5}$/);
    });
  });

  test("동시성 안전: 100행 INSERT → seq_no 100개 모두 유일", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(
        "insert into public.applications (company) select 'c' || g from generate_series(1,100) g",
      );
      const r = await c.query(
        "select count(*)::int total, count(distinct seq_no)::int uniq from public.applications",
      );
      expect(r.rows[0].total).toBe(100);
      expect(r.rows[0].uniq).toBe(100);
    });
  });
});

describe("applications — anon 공개 폼 INSERT (WITH CHECK, E-5)", () => {
  test("anon은 status=new, assignee null로 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("insert into public.applications (company) values ('가나다')");
      await asPostgres(c);
      const r = await c.query(
        "select status, assignee_id from public.applications where company='가나다'",
      );
      expect(r.rows[0].status).toBe("new");
      expect(r.rows[0].assignee_id).toBeNull();
    });
  });

  test("anon이 status!=new로 INSERT 시 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company, status) values ('x','assigned')"),
      ).rejects.toThrow();
    });
  });

  test("anon이 assignee_id 지정 시 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company, assignee_id) values ('x',$1)", [UID.sales1]),
      ).rejects.toThrow();
    });
  });

  test("anon은 applications를 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.applications (company) values ('비밀상사')");
      await asAnon(c);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("applications — assignee row scope (E-4)", () => {
  const APP1 = "00000000-0000-0000-0000-0000000000f1";
  const APP2 = "00000000-0000-0000-0000-0000000000f2";

  async function seedScoped(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
    await seedAuthUser(c, UID.admin, "admin@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,assignee_id) values ($1,'A',$2),($3,'B',$4)", [APP1, UID.sales1, APP2, UID.sales2]);
  }

  test("view_all 없는 사용자는 자기 배정 건만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedScoped();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.applications");
      expect(r.rows.map((x) => x.id)).toEqual([APP1]);
    });
  });

  test("applications.view_all 보유자는 전체를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedScoped();
      await asUser(c, UID.admin);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(2);
    });
  });
});
