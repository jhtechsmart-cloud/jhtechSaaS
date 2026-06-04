// M2 P-D #22 — service_requests RLS·트리거·채번 통합 테스트.
// 신원모델 A(사업자번호+담당자 콜백): anon 직접 INSERT 금지(제출은 RPC만), 등록고객은 company.assignee_id로
// row-scope, 미등록(company_id NULL)·미배정(assignee NULL)은 view_all만 열람. 서버통제값은 트리거 불변.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 회사 1곳(담당=sales1) + 권한자(admin=view_all+manage) + 비담당(sales2) 시딩. company_id 반환.
async function seed(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "sr-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "sr-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "sr-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{service_requests.view_all,service_requests.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
  const r = await c.query(
    "insert into public.companies (name, biz_no, assignee_id) values ('테스트상사','1234567891',$1) returning id",
    [UID.sales1],
  );
  return r.rows[0].id as string;
}

// postgres(RLS 우회)로 service_requests 직접 INSERT. NOT NULL 컬럼 채움.
async function insertReq(over: Record<string, unknown> = {}): Promise<string> {
  const cols = {
    biz_no: "1234567891",
    company_id: null,
    company_equipment_id: null,
    assignee_id: null,
    contact_company: "테스트상사",
    status: "received",
    privacy_consent: true,
    privacy_consent_at: "now()",
    privacy_consent_version: "v1.0",
    fields: JSON.stringify({ symptom: "고장남" }),
    ...over,
  } as Record<string, unknown>;
  const r = await c.query(
    `insert into public.service_requests
      (biz_no, company_id, company_equipment_id, assignee_id, contact_company, status,
       privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,$3,$4,$5,$6,$7, now(), $8, $9::jsonb) returning id`,
    [cols.biz_no, cols.company_id, cols.company_equipment_id, cols.assignee_id,
     cols.contact_company, cols.status, cols.privacy_consent, cols.privacy_consent_version, cols.fields],
  );
  return r.rows[0].id as string;
}

describe("service_requests — 채번·트리거 불변", () => {
  test("seq_no는 트리거가 AS-YYYYMMDD-NNNNN로 강제(클라 지정 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const r = await c.query(
        `insert into public.service_requests
          (seq_no, biz_no, contact_company, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
         values ('HACK-1', '1234567891', '상사', true, now(), 'v1.0', '{"symptom":"x"}'::jsonb)
         returning seq_no`,
      );
      expect(r.rows[0].seq_no).toMatch(/^AS-\d{8}-\d{5,}$/);
    });
  });

  test("created_at은 INSERT 시 now() 강제, UPDATE 시 보존", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const id = await insertReq();
      const a = await c.query("select created_at from public.service_requests where id=$1", [id]);
      // 클라가 옛 날짜를 넣어도 트리거가 now()로 덮음 → 최근 1분 이내
      expect(new Date(a.rows[0].created_at).getTime()).toBeGreaterThan(Date.now() - 60000);
    });
  });

  test("assignee_id는 company.assignee_id에서 트리거가 채움", async () => {
    await inRollbackTx(c, async () => {
      const companyId = await seed(); await asPostgres(c);
      const id = await insertReq({ company_id: companyId, assignee_id: null });
      const r = await c.query("select assignee_id from public.service_requests where id=$1", [id]);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("terminal 잠금: done→다른 상태 UPDATE 거부, received→in_progress 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const id = await insertReq({ status: "received" });
      await c.query("update public.service_requests set status='in_progress' where id=$1", [id]);
      await c.query("update public.service_requests set status='done' where id=$1", [id]);
      await c.query("savepoint sp");
      await expect(
        c.query("update public.service_requests set status='received' where id=$1", [id]),
      ).rejects.toThrow();
      await c.query("rollback to savepoint sp");
    });
  });
});

describe("service_requests — RLS row-scope", () => {
  test("anon 직접 SELECT = 0행", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await insertReq({ assignee_id: UID.sales1 });
      await asAnon(c);
      const r = await c.query("select id from public.service_requests");
      expect(r.rowCount).toBe(0);
    });
  });

  test("anon 직접 INSERT 거부(제출은 RPC만)", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      await expect(
        c.query(
          `insert into public.service_requests
            (biz_no, contact_company, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
           values ('1234567891','x',true,now(),'v1.0','{"symptom":"x"}'::jsonb)`,
        ),
      ).rejects.toThrow();
    });
  });

  test("담당자는 자기 배정 건만, 비담당은 0, view_all은 전체", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await insertReq({ assignee_id: UID.sales1 });
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(1);
      await asUser(c, UID.sales2);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(0);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(1);
    });
  });

  test("assignee NULL(미배정·미등록) 행은 view_all만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      await insertReq({ assignee_id: null });
      await asUser(c, UID.sales1);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(0);
      await asUser(c, UID.admin);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(1);
    });
  });

  test("UPDATE: 담당자 본인 OR manage만, 비담당+무권한 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const id = await insertReq({ assignee_id: UID.sales1 });
      await asUser(c, UID.sales2);
      // RLS USING이 비담당 행을 걸러 0행 업데이트(에러 아님).
      expect((await c.query("update public.service_requests set status='in_progress' where id=$1", [id])).rowCount).toBe(0);
      // 담당자 본인은 가능
      await asUser(c, UID.sales1);
      const r = await c.query("update public.service_requests set status='in_progress' where id=$1 returning id", [id]);
      expect(r.rowCount).toBe(1);
    });
  });

  test("DELETE: users.manage만", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asPostgres(c);
      const id = await insertReq({ assignee_id: UID.sales1 });
      await asUser(c, UID.admin); // view_all+manage지만 users.manage 아님
      expect((await c.query("delete from public.service_requests where id=$1", [id])).rowCount).toBe(0);
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      expect((await c.query("delete from public.service_requests where id=$1", [id])).rowCount).toBe(1);
    });
  });
});

describe("service_requests — self-claim 스코프 (E5a step3)", () => {
  // sales1 = claim+status만(view_all 없음), sales2 = 권한 없음.
  async function seedClaim(): Promise<{ pool: string; other: string }> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "sc-sales1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "sc-sales2@jhtech.test");
    await c.query("update public.profiles set permissions='{service_requests.claim,service_requests.status}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
    const pool = await insertReq({ assignee_id: null }); // 미배정
    const other = await insertReq({ assignee_id: UID.sales2 }); // 타인 배정
    return { pool, other };
  }

  test("claim 보유자는 미배정 A/S를 SELECT로 본다(타인 배정건 제외)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.service_requests");
      expect(r.rows.map((x) => x.id)).toEqual([pool]);
    });
  });

  test("claim 보유자가 미배정 A/S를 본인으로 가져온다(assignee=uid)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.service_requests set assignee_id=$1 where id=$2 and assignee_id is null returning assignee_id",
        [UID.sales1, pool],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("claim 보유자가 타인 배정 A/S는 못 가져온다(0행)", async () => {
    await inRollbackTx(c, async () => {
      const { other } = await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.service_requests set assignee_id=$1 where id=$2 and assignee_id is null returning id",
        [UID.sales1, other],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  test("claim 보유자가 미배정 A/S를 타인에게 배정하면 거부(escalation 방지)", async () => {
    await inRollbackTx(c, async () => {
      const { pool } = await seedClaim();
      await asUser(c, UID.sales1);
      await expect(
        c.query("update public.service_requests set assignee_id=$1 where id=$2 and assignee_id is null", [UID.sales2, pool]),
      ).rejects.toThrow();
    });
  });
});
