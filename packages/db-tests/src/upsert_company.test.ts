import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "up-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "up-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
}
async function mkApp(biz: string | null, company = "신청사"): Promise<string> {
  const r = await c.query("insert into public.applications (company,biz_no,phone) values ($1,$2,'010-1') returning id", [company, biz]);
  return r.rows[0].id as string;
}

describe("upsert_company_from_application", () => {
  test("권한 없으면 raise", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp("1234567890"); await asUser(c, UID.sales1);
      await expect(c.query("select public.upsert_company_from_application($1)", [app])).rejects.toThrow(/customers.manage/);
    });
  });
  test("신규 → created=true, 고객 생성 + source 연결", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp("1234567890"); await asUser(c, UID.admin);
      const j = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j.created).toBe(true);
      await asPostgres(c);
      const co = await c.query("select source_application_id from public.companies where id=$1", [j.company_id]);
      expect(co.rows[0].source_application_id).toBe(app);
    });
  });
  test("biz_no 일치 기존 고객 → created=false, 신규 안 만듦(멱등)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await c.query("insert into public.companies (name,biz_no) values ('기존','1234567890')");
      const app = await mkApp("123-45-67890");
      await asUser(c, UID.admin);
      const j = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j.created).toBe(false);
      await asPostgres(c);
      expect((await c.query("select count(*) n from public.companies where biz_no='1234567890'")).rows[0].n).toBe("1");
    });
  });
  test("biz_no NULL → 동일 신청 재호출 시 신규 안 만듦(source dedupe)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); const app = await mkApp(null); await asUser(c, UID.admin);
      const j1 = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      const j2 = (await c.query("select public.upsert_company_from_application($1) as j", [app])).rows[0].j;
      expect(j1.company_id).toBe(j2.company_id);
      expect(j2.created).toBe(false);
    });
  });
});

describe("search_applications_for_customer", () => {
  test("권한 없으면 raise", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await mkApp("1234567890", "검색대상"); await asUser(c, UID.sales1);
      await expect(c.query("select * from public.search_applications_for_customer('검색')")).rejects.toThrow(/customers.manage/);
    });
  });
  test("회사명 검색(권한자, view_all 불필요)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await mkApp("1234567890", "유니크검색사"); await asUser(c, UID.admin);
      const r = await c.query("select * from public.search_applications_for_customer('유니크검색')");
      expect(r.rowCount).toBe(1);
    });
  });
});
