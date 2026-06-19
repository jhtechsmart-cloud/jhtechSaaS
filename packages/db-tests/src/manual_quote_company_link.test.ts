import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 수기 견적의 company_id 연결 + 고객 이력 노출(B1·B2).
// 이력 매칭이 biz_no·source_application_id뿐이라 biz_no 없는 이관 고객은 수기견적이 안 떴음 →
// company_id 매칭 추가로 biz_no 없어도 이력에 표시되는지 단언.

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const COMPANY = "00000000-0000-0000-0000-00000000c001";
const ITEM = (unitPrice: number, quantity = 1, name = "장비") => ({ name, unitPrice, quantity });

// sales1 = quotes.write + customers.view_all(이력 조회 게이트 통과용).
async function seed(opts?: { bizNo?: string | null }): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query("update public.profiles set permissions='{quotes.write,customers.view_all}' where id=$1", [UID.sales1]);
  await c.query(
    "insert into public.companies (id, name, biz_no) values ($1, '연결고객', $2)",
    [COMPANY, opts?.bizNo ?? null],
  );
}

// 9-인자 create_manual_quote(…, p_spec_selection, p_company_id) 호출.
async function createManualQuote(
  company: string,
  companyId: string | null,
  items: object[] = [ITEM(10_000_000)],
) {
  const r = await c.query(
    "select public.create_manual_quote($1,$2,$3,$4,$5,$6,$7,$8,$9) as q",
    [company, null, null, null, JSON.stringify(items), JSON.stringify([]), "draft", null, companyId],
  );
  return r.rows[0].q as { application_id: string; quote: Record<string, unknown> };
}

async function history(companyId: string) {
  const r = await c.query("select public.get_company_request_history($1) as h", [companyId]);
  return r.rows[0].h as { applications: { id: string; seq_no: string }[] };
}

describe("create_manual_quote — company_id 연결", () => {
  test("p_company_id 지정 시 applications.company_id에 저장", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      await asPostgres(c);
      const app = await c.query("select company_id from public.applications where id=$1", [res.application_id]);
      expect(app.rows[0].company_id).toBe(COMPANY);
    });
  });

  test("p_company_id 미지정(수기 신규)은 company_id null", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote("신규수기", null);
      await asPostgres(c);
      const app = await c.query("select company_id from public.applications where id=$1", [res.application_id]);
      expect(app.rows[0].company_id).toBeNull();
    });
  });

  test("존재하지 않는 company_id는 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(
        createManualQuote("연결고객", "00000000-0000-0000-0000-0000000000ff"),
      ).rejects.toThrow();
    });
  });

  test("company_id는 생성 후 UPDATE 불변(트리거)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      await asPostgres(c);
      await c.query("update public.applications set company_id=null where id=$1", [res.application_id]);
      const app = await c.query("select company_id from public.applications where id=$1", [res.application_id]);
      expect(app.rows[0].company_id).toBe(COMPANY); // OLD 보존
    });
  });
});

describe("get_company_request_history — company_id 매칭", () => {
  test("biz_no 없는 고객도 company_id로 연결된 수기견적이 이력에 표시", async () => {
    await inRollbackTx(c, async () => {
      await seed({ bizNo: null }); // biz_no 없음
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      const h = await history(COMPANY);
      const ids = h.applications.map((a) => a.id);
      expect(ids).toContain(res.application_id);
    });
  });

  test("company_id 미연결 수기견적은 그 고객 이력에 안 뜸", async () => {
    await inRollbackTx(c, async () => {
      await seed({ bizNo: null });
      await asUser(c, UID.sales1);
      const res = await createManualQuote("무관업체", null);
      const h = await history(COMPANY);
      const ids = h.applications.map((a) => a.id);
      expect(ids).not.toContain(res.application_id);
    });
  });
});
