// M2 P-F #24 — 통합 고객이력 RPC: get_company_request_history(견적·AS·소모품 한 번에).
// DEFINER + customers.manage 게이트(테이블 RLS 무변경). 견적은 biz_no 정규화 OR source_application_id UNION.
// 담당자 무관 전체 열람(customers.manage면 남이 담당한 건도 보임).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// caller=sales1(customers.manage). 데이터 담당=sales2(남) → 담당자 무관 열람 검증.
// 회사 biz='1234567890', 담당 sales2. 견적: 하이픈매칭 1 + 미매칭 1. AS 1(sales2 담당). 소모품 1 + items 2.
async function seed(): Promise<{ companyId: string; matchedApp: string; unmatchedApp: string; ink: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "gcrh-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "gcrh-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);

  const companyId = (await c.query(
    "insert into public.companies (name, biz_no, assignee_id) values ('재현상사','1234567890',$1) returning id",
    [UID.sales2],
  )).rows[0].id;

  // 견적: 하이픈 biz_no(정규화 시 매칭) + 미매칭 biz_no
  const matchedApp = (await c.query(
    "insert into public.applications (company, biz_no, phone) values ('재현상사','123-45-67890','010-1') returning id",
  )).rows[0].id;
  const unmatchedApp = (await c.query(
    "insert into public.applications (company, biz_no, phone) values ('남의회사','9999999999','010-2') returning id",
  )).rows[0].id;

  // AS(service_requests) — company_id 연결, 담당 sales2(트리거가 채움)
  await c.query(
    `insert into public.service_requests
       (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ('1234567890',$1,'재현상사','received', true, now(), 'v1.0', '{"symptom":"고장"}'::jsonb)`,
    [companyId],
  );

  // 소모품(supply_requests + items)
  const ink = (await c.query("insert into public.consumables (name, unit, price) values ('UV잉크','개',50000) returning id")).rows[0].id;
  const reqId = (await c.query(
    `insert into public.supply_requests (company_id, requester_name, requester_phone, privacy_consent, privacy_consent_at, privacy_consent_version)
     values ($1,'담당','010',true,now(),'v1.0') returning id`,
    [companyId],
  )).rows[0].id;
  await c.query(
    "insert into public.supply_request_items (request_id, consumable_id, consumable_name_snapshot, qty) values ($1,$2,'UV잉크',3)",
    [reqId, ink],
  );

  return { companyId, matchedApp, unmatchedApp, ink };
}

describe("get_company_request_history — 권한 게이트", () => {
  test("customers.manage 없으면 raise", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed();
      await asUser(c, UID.sales2); // 담당이지만 customers.manage 없음
      await expect(
        c.query("select public.get_company_request_history($1)", [companyId]),
      ).rejects.toThrow(/customers.manage/);
    });
  });

  test("users.manage(admin) 자동 통과", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed();
      await asPostgres(c);
      await seedAuthUser(c, UID.admin, "gcrh-admin@jhtech.test");
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      expect(out).toHaveProperty("applications");
      expect(out).toHaveProperty("service_requests");
      expect(out).toHaveProperty("supply_requests");
    });
  });
});

describe("get_company_request_history — 담당자 무관 전체 조인", () => {
  test("customers.manage 보유자는 남(sales2) 담당 AS·소모품·견적 전체를 본다", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed();
      await asUser(c, UID.sales1); // 담당 아님 + customers.manage
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      expect(out.service_requests.length).toBe(1);
      expect(out.supply_requests.length).toBe(1);
      expect(out.applications.length).toBe(1); // 매칭 견적만(미매칭 제외)
    });
  });

  test("하이픈 사업자번호 견적이 정규화 매칭된다", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, matchedApp } = await seed();
      await asUser(c, UID.sales1);
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      const ids = (out.applications as Array<{ id: string }>).map((a) => a.id);
      expect(ids).toContain(matchedApp);
    });
  });

  test("미매칭 biz_no 견적은 반환하지 않는다", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, unmatchedApp } = await seed();
      await asUser(c, UID.sales1);
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      const ids = (out.applications as Array<{ id: string }>).map((a) => a.id);
      expect(ids).not.toContain(unmatchedApp);
    });
  });

  test("소모품 item_count·items 집계 반환", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed();
      await asUser(c, UID.sales1);
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      const sr = out.supply_requests[0];
      expect(sr.item_count).toBe(1);
      expect((sr.items as Array<{ consumable_name_snapshot: string; qty: number }>)[0]).toMatchObject({
        consumable_name_snapshot: "UV잉크",
        qty: 3,
      });
    });
  });
});

describe("get_company_request_history — NULL biz_no는 source_application_id UNION", () => {
  test("biz_no 없는 고객도 출처 견적(source_application_id) 1건 표시", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "gcrh-null-sales1@jhtech.test");
      await c.query("update public.profiles set permissions='{customers.manage}' where id=$1", [UID.sales1]);
      const srcApp = (await c.query(
        "insert into public.applications (company, biz_no, phone) values ('무번호상사', null, '010-9') returning id",
      )).rows[0].id;
      const companyId = (await c.query(
        "insert into public.companies (name, biz_no, source_application_id) values ('무번호상사', null, $1) returning id",
        [srcApp],
      )).rows[0].id;
      await asUser(c, UID.sales1);
      const out = (await c.query("select public.get_company_request_history($1) as out", [companyId])).rows[0].out;
      const ids = (out.applications as Array<{ id: string }>).map((a) => a.id);
      expect(ids).toContain(srcApp);
    });
  });
});
