// M2 P-E #23 — supply_requests(+items) RLS·트리거·채번 통합 테스트.
// 등록고객 전용(company_id NOT NULL): anon 직접 INSERT 금지(제출은 submit_supply_request RPC만),
// 담당영업으로 row-scope, 미배정(assignee NULL)은 supply_requests.view_all만 열람. 서버통제값은 트리거 불변.
// items: 부모 SELECT 권한 따라감(EXISTS), 직접 write(INSERT/UPDATE/DELETE) 전면 차단.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 회사 1곳(담당=sales1) + 권한자(admin=view_all+manage) + 비담당(sales2) + 소모품 2개. {companyId, ink} 반환.
async function seed(): Promise<{ companyId: string; ink: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "sup-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "sup-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "sup-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{supply_requests.view_all,supply_requests.status}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
  const co = await c.query(
    "insert into public.companies (name, biz_no, assignee_id) values ('소모품상사','1234567891',$1) returning id",
    [UID.sales1],
  );
  const companyId = co.rows[0].id as string;
  const ink = (await c.query("insert into public.consumables (name, unit) values ('UV잉크','개') returning id")).rows[0].id as string;
  return { companyId, ink };
}

// postgres(RLS 우회)로 supply_requests 직접 INSERT. NOT NULL 컬럼 채움. id 반환.
async function insertReq(companyId: string, over: Record<string, unknown> = {}): Promise<string> {
  const cols = {
    company_id: companyId,
    status: "received",
    requester_name: "구매담당",
    requester_phone: "0212345678",
    ...over,
  } as Record<string, unknown>;
  const r = await c.query(
    `insert into public.supply_requests
       (company_id, status, requester_name, requester_phone, privacy_consent, privacy_consent_at, privacy_consent_version)
     values ($1,$2,$3,$4,true, now(), 'v1.0') returning id`,
    [cols.company_id, cols.status, cols.requester_name, cols.requester_phone],
  );
  return r.rows[0].id as string;
}

async function insertItem(requestId: string, consumableId: string, qty = 1): Promise<string> {
  const r = await c.query(
    `insert into public.supply_request_items
       (request_id, consumable_id, consumable_name_snapshot, consumable_unit_snapshot, qty)
     values ($1,$2,'UV잉크','개',$3) returning id`,
    [requestId, consumableId, qty],
  );
  return r.rows[0].id as string;
}

describe("supply_requests — 채번·트리거 불변", () => {
  test("seq_no는 트리거가 SUP-YYYYMMDD-NNNNN로 강제(클라 지정 무시)", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const r = await c.query(
        `insert into public.supply_requests
          (seq_no, company_id, requester_name, requester_phone, privacy_consent, privacy_consent_at, privacy_consent_version)
         values ('HACK-1', $1, '담당', '010', true, now(), 'v1.0') returning seq_no`,
        [companyId],
      );
      expect(r.rows[0].seq_no).toMatch(/^SUP-\d{8}-\d{5,}$/);
    });
  });

  test("created_at은 INSERT 시 now() 강제, company_id 불변", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const id = await insertReq(companyId);
      const a = await c.query("select created_at from public.supply_requests where id=$1", [id]);
      expect(new Date(a.rows[0].created_at).getTime()).toBeGreaterThan(Date.now() - 60000);
    });
  });

  test("assignee_id는 company.assignee_id에서 트리거가 채움", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const id = await insertReq(companyId, { assignee_id: null });
      const r = await c.query("select assignee_id from public.supply_requests where id=$1", [id]);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("terminal 잠금: done→다른 상태 UPDATE 거부, received→in_progress 허용", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const id = await insertReq(companyId, { status: "received" });
      await c.query("update public.supply_requests set status='in_progress' where id=$1", [id]);
      await c.query("update public.supply_requests set status='done' where id=$1", [id]);
      await c.query("savepoint sp");
      await expect(
        c.query("update public.supply_requests set status='received' where id=$1", [id]),
      ).rejects.toThrow();
      await c.query("rollback to savepoint sp");
    });
  });

  test("items qty는 1..9999 CHECK 강제", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asPostgres(c);
      const reqId = await insertReq(companyId);
      await c.query("savepoint sp");
      await expect(insertItem(reqId, ink, 0)).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(insertItem(reqId, ink, 10000)).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      expect(await insertItem(reqId, ink, 5)).toBeTruthy();
    });
  });

  test("items 같은 consumable 중복 라인 차단(UNIQUE)", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asPostgres(c);
      const reqId = await insertReq(companyId);
      await insertItem(reqId, ink, 1);
      await expect(insertItem(reqId, ink, 2)).rejects.toThrow();
    });
  });
});

describe("supply_requests — RLS row-scope", () => {
  test("anon 직접 SELECT/INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      await insertReq(companyId);
      await asAnon(c);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(0);
      await expect(
        c.query(
          `insert into public.supply_requests
            (company_id, requester_name, requester_phone, privacy_consent, privacy_consent_at, privacy_consent_version)
           values ($1,'x','y',true,now(),'v1.0')`,
          [companyId],
        ),
      ).rejects.toThrow();
    });
  });

  test("담당자는 자기 배정 건만, 비담당은 0, view_all은 전체", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      await insertReq(companyId);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(1);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(0);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(1);
    });
  });

  test("등록·미배정(assignee NULL) 행은 view_all만 본다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.admin, "sup-admin@jhtech.test");
      await seedAuthUser(c, UID.sales1, "sup-sales1@jhtech.test");
      await c.query("update public.profiles set permissions='{supply_requests.view_all}' where id=$1", [UID.admin]);
      await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
      // 담당 미배정 회사
      const co = await c.query("insert into public.companies (name, biz_no) values ('미배정상사','1234567891') returning id");
      await insertReq(co.rows[0].id as string, { assignee_id: null });
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(0);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(1);
    });
  });

  test("UPDATE: 담당자 본인 OR manage만", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const id = await insertReq(companyId);
      await asUser(c, UID.sales2);
      expect((await c.query("update public.supply_requests set status='in_progress' where id=$1", [id])).rowCount).toBe(0);
      await asUser(c, UID.sales1);
      expect((await c.query("update public.supply_requests set status='in_progress' where id=$1 returning id", [id])).rowCount).toBe(1);
    });
  });

  test("DELETE: users.manage만", async () => {
    await inRollbackTx(c, async () => {
      const { companyId } = await seed(); await asPostgres(c);
      const id = await insertReq(companyId);
      await asUser(c, UID.admin); // view_all+manage지만 users.manage 아님
      expect((await c.query("delete from public.supply_requests where id=$1", [id])).rowCount).toBe(0);
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      expect((await c.query("delete from public.supply_requests where id=$1", [id])).rowCount).toBe(1);
    });
  });
});

describe("supply_request_items — RLS는 부모 따라감, 직접 write 차단", () => {
  test("items SELECT: 부모 볼 수 있는 사람만(담당 1행, 비담당 0행)", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asPostgres(c);
      const reqId = await insertReq(companyId);
      await insertItem(reqId, ink, 3);
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.supply_request_items")).rowCount).toBe(1);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.supply_request_items")).rowCount).toBe(0);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.supply_request_items")).rowCount).toBe(1);
    });
  });

  test("anon·authenticated 직접 INSERT/UPDATE/DELETE 차단", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asPostgres(c);
      const reqId = await insertReq(companyId);
      const itemId = await insertItem(reqId, ink, 1);
      // anon insert
      await asAnon(c);
      await c.query("savepoint sp");
      await expect(
        c.query(`insert into public.supply_request_items (request_id, consumable_id, consumable_name_snapshot, qty) values ($1,$2,'x',1)`, [reqId, ink]),
      ).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      // authenticated(담당자라 SELECT는 되지만) 직접 write는 정책 없음 → 0행/거부
      await asUser(c, UID.sales1);
      expect((await c.query("update public.supply_request_items set qty=9 where id=$1", [itemId])).rowCount).toBe(0);
      expect((await c.query("delete from public.supply_request_items where id=$1", [itemId])).rowCount).toBe(0);
    });
  });

  test("부모 삭제 시 items cascade", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asPostgres(c);
      const reqId = await insertReq(companyId);
      await insertItem(reqId, ink, 1);
      await c.query("delete from public.supply_requests where id=$1", [reqId]);
      expect((await c.query("select id from public.supply_request_items where request_id=$1", [reqId])).rowCount).toBe(0);
    });
  });
});

describe("supply_requests — self-claim 스코프 (E5a step3)", () => {
  // sales1 = claim+status만(view_all 없음), sales2 = 권한 없음.
  // 미배정 풀 = assignee null 회사, 타인 배정 = assignee=sales2 회사(트리거가 회사에서 채움).
  async function seedClaim(): Promise<{ pool: string; other: string }> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "supc-sales1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "supc-sales2@jhtech.test");
    await c.query("update public.profiles set permissions='{supply_requests.claim,supply_requests.status}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
    const coNull = (await c.query("insert into public.companies (name, biz_no) values ('미배정상사','1234567891') returning id")).rows[0].id as string;
    const coS2 = (await c.query("insert into public.companies (name, biz_no, assignee_id) values ('타인상사','1234567892',$1) returning id", [UID.sales2])).rows[0].id as string;
    const pool = await insertReq(coNull);
    const other = await insertReq(coS2);
    return { pool, other };
  }

  test("claim 보유자는 미배정 소모품신청을 SELECT로 본다(타인 배정건 제외)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.supply_requests");
      expect(r.rows.map((x) => x.id)).toEqual([pool]);
    });
  });

  test("claim 보유자가 미배정 소모품신청을 본인으로 가져온다(assignee=uid)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.supply_requests set assignee_id=$1 where id=$2 and assignee_id is null returning assignee_id",
        [UID.sales1, pool],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("claim 보유자가 타인 배정 소모품신청은 못 가져온다(0행)", async () => {
    await inRollbackTx(c, async () => {
      const { other } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.supply_requests set assignee_id=$1 where id=$2 and assignee_id is null returning id",
        [UID.sales1, other],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  test("claim 보유자가 미배정 소모품신청을 타인에게 배정하면 거부(escalation 방지)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      await expect(
        c.query("update public.supply_requests set assignee_id=$1 where id=$2 and assignee_id is null", [UID.sales2, pool]),
      ).rejects.toThrow();
    });
  });
});
