import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// sync_company_assignee_from_application — 견적 담당자 → 연결 고객 담당영업 단방향 전파(fill-if-empty).
describe("sync_company_assignee_from_application — 담당영업 전파", () => {
  const APP = "00000000-0000-0000-0000-0000000a5901"; // source_application_id 링크용
  const CO = "00000000-0000-0000-0000-0000000a5902";

  async function seed(opts: { coAssignee?: string | null; appBiz?: string | null } = {}): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "p-sales1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "p-sales2@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
    // 견적: sales1 배정됨(claim 직후 상태 시뮬레이션).
    await c.query(
      "insert into public.applications (id,company,status,assignee_id,biz_no) values ($1,'전파상사','assigned',$2,$3)",
      [APP, UID.sales1, opts.appBiz ?? null],
    );
    // 고객: 이 견적으로 등록됨(source_application_id 링크). 담당영업은 opts.coAssignee.
    await c.query(
      "insert into public.companies (id,name,source_application_id,assignee_id) values ($1,'전파상사',$2,$3)",
      [CO, APP, opts.coAssignee ?? null],
    );
  }

  test("담당영업이 비어있으면 견적 담당자로 채움(claim 영업)", async () => {
    await inRollbackTx(c, async () => {
      await seed({ coAssignee: null });
      await asUser(c, UID.sales1);
      const r = await c.query("select public.sync_company_assignee_from_application($1) cid", [APP]);
      expect(r.rows[0].cid).toBe(CO);
      await asPostgres(c);
      const co = await c.query("select assignee_id from public.companies where id=$1", [CO]);
      expect(co.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("이미 담당영업이 있으면 안 덮음(fill-if-empty)", async () => {
    await inRollbackTx(c, async () => {
      await seed({ coAssignee: UID.sales2 }); // 고객 담당영업 = sales2(앞서 지정)
      await asUser(c, UID.sales1);
      await c.query("select public.sync_company_assignee_from_application($1)", [APP]);
      await asPostgres(c);
      const co = await c.query("select assignee_id from public.companies where id=$1", [CO]);
      expect(co.rows[0].assignee_id).toBe(UID.sales2); // 그대로
    });
  });

  test("연결 고객이 없으면 no-op(null 반환, 에러 없음)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "p2-sales1@jhtech.test");
      await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
      await c.query(
        "insert into public.applications (id,company,status,assignee_id) values ($1,'미등록상사','assigned',$2)",
        [APP, UID.sales1],
      );
      await asUser(c, UID.sales1);
      const r = await c.query("select public.sync_company_assignee_from_application($1) cid", [APP]);
      expect(r.rows[0].cid).toBeNull();
    });
  });

  test("배정 권한 없는 계정은 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed({ coAssignee: null });
      await asUser(c, UID.sales2); // 빈 권한
      await expect(
        c.query("select public.sync_company_assignee_from_application($1)", [APP]),
      ).rejects.toThrow();
    });
  });

  test("배정 해제(견적 assignee null)는 고객 담당영업을 지우지 않음(단방향)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "p4-sales1@jhtech.test");
      await seedAuthUser(c, UID.sales2, "p4-sales2@jhtech.test");
      await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
      // 견적은 미배정(assignee null), 고객은 이미 sales2 담당.
      await c.query(
        "insert into public.applications (id,company,status) values ($1,'해제상사','new')",
        [APP],
      );
      await c.query(
        "insert into public.companies (id,name,source_application_id,assignee_id) values ($1,'해제상사',$2,$3)",
        [CO, APP, UID.sales2],
      );
      await asUser(c, UID.sales1);
      const r = await c.query("select public.sync_company_assignee_from_application($1) cid", [APP]);
      expect(r.rows[0].cid).toBeNull(); // 견적 미배정 → 조기 반환
      await asPostgres(c);
      const co = await c.query("select assignee_id from public.companies where id=$1", [CO]);
      expect(co.rows[0].assignee_id).toBe(UID.sales2); // 그대로(안 지움)
    });
  });

  test("biz_no만 일치하고 source_application_id 링크 없는 고객은 전파 안 됨(IDOR 차단)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "p5-sales1@jhtech.test");
      await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
      const APP2 = "00000000-0000-0000-0000-0000000a5903";
      const CO2 = "00000000-0000-0000-0000-0000000a5904";
      // 영업이 biz_no를 변조한 견적(자기 배정) + 무관한 고객(같은 biz_no, source 링크 없음).
      await c.query(
        "insert into public.applications (id,company,status,assignee_id,biz_no) values ($1,'탈취시도','assigned',$2,'123-45-67890')",
        [APP2, UID.sales1],
      );
      await c.query(
        "insert into public.companies (id,name,biz_no,assignee_id) values ($1,'피해고객','1234567890',null)",
        [CO2],
      );
      await asUser(c, UID.sales1);
      const r = await c.query("select public.sync_company_assignee_from_application($1) cid", [APP2]);
      expect(r.rows[0].cid).toBeNull(); // source_application_id 링크 없으면 전파 안 함
      await asPostgres(c);
      const co = await c.query("select assignee_id from public.companies where id=$1", [CO2]);
      expect(co.rows[0].assignee_id).toBeNull(); // 탈취 차단
    });
  });
});
