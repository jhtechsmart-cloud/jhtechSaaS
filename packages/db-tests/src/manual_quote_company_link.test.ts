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

  // 20260714121000: company_id 동결 해제 — '연결된 고객' 가변 링크로 의미 변경(연결·재연결·해제 허용).
  test("company_id는 UPDATE로 변경 가능(동결 해제 — 연결 링크)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      await asPostgres(c);
      await c.query("update public.applications set company_id=null where id=$1", [res.application_id]);
      const app = await c.query("select company_id from public.applications where id=$1", [res.application_id]);
      expect(app.rows[0].company_id).toBeNull(); // 해제 반영
      // 재연결도 가능
      await c.query("update public.applications set company_id=$2 where id=$1", [res.application_id, COMPANY]);
      const app2 = await c.query("select company_id from public.applications where id=$1", [res.application_id]);
      expect(app2.rows[0].company_id).toBe(COMPANY);
    });
  });

  test("seq_no·created_at·source 동결은 유지(회귀)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      await asPostgres(c);
      const before = await c.query("select seq_no, created_at, source from public.applications where id=$1", [res.application_id]);
      await c.query(
        "update public.applications set created_at=now()+interval '1 day', source='public' where id=$1",
        [res.application_id],
      );
      const after = await c.query("select seq_no, created_at, source from public.applications where id=$1", [res.application_id]);
      expect(after.rows[0].seq_no).toBe(before.rows[0].seq_no);
      expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
      expect(after.rows[0].source).toBe(before.rows[0].source);
    });
  });

  test("assignee(RLS)로도 자기 의뢰 company_id 연결 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      // 수기 견적은 sales1이 생성(assignee 본인) → RLS applications_update 통과 확인.
      const res = await createManualQuote("연결고객", null);
      const upd = await c.query(
        "update public.applications set company_id=$2 where id=$1 returning company_id",
        [res.application_id, COMPANY],
      );
      expect(upd.rows[0].company_id).toBe(COMPANY);
    });
  });
});

describe("upsert_company_from_application — 의뢰 연결 기록", () => {
  test("고객 등록 시 applications.company_id도 세팅", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query("update public.profiles set permissions='{customers.edit,customers.view_all}' where id=$1", [UID.sales1]);
      // 공개폼 유사 의뢰를 직접 시드(사업자번호 보유).
      const app = await c.query(
        `insert into public.applications (company, biz_no, ceo, phone, status, source, assignee_id)
         values ('업서트고객', '2208162517', '조선제', '01011112222', 'new', 'public', $1) returning id`,
        [UID.sales1],
      );
      const appId = app.rows[0].id as string;
      await asUser(c, UID.sales1);
      const r = await c.query("select public.upsert_company_from_application($1) as u", [appId]);
      const u = r.rows[0].u as { company_id: string; created: boolean };
      expect(u.created).toBe(true);
      await asPostgres(c);
      const linked = await c.query("select company_id from public.applications where id=$1", [appId]);
      expect(linked.rows[0].company_id).toBe(u.company_id);
    });
  });

  test("기존 고객(biz_no 일치)이어도 company_id 연결 기록", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query("update public.profiles set permissions='{customers.edit,customers.view_all}' where id=$1", [UID.sales1]);
      await c.query("insert into public.companies (id, name, biz_no) values ($1,'기존고객','2208162517')", [COMPANY]);
      const app = await c.query(
        `insert into public.applications (company, biz_no, status, source, assignee_id)
         values ('기존고객', '220-81-62517', 'new', 'public', $1) returning id`,
        [UID.sales1],
      );
      const appId = app.rows[0].id as string;
      await asUser(c, UID.sales1);
      const r = await c.query("select public.upsert_company_from_application($1) as u", [appId]);
      const u = r.rows[0].u as { company_id: string; created: boolean };
      expect(u.created).toBe(false);
      expect(u.company_id).toBe(COMPANY);
      await asPostgres(c);
      const linked = await c.query("select company_id from public.applications where id=$1", [appId]);
      expect(linked.rows[0].company_id).toBe(COMPANY);
    });
  });
});

describe("create_manual_quote — company_id 담당 스코프(IDOR 방지)", () => {
  test("quotes.write만 있고 담당 아닌 고객 연결은 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
      await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales2]);
      // sales1 담당 고객을 sales2(quotes.write·view_all 없음)가 연결 시도 → 거부.
      await c.query("insert into public.companies (id, name, assignee_id) values ($1,'남의고객',$2)", [COMPANY, UID.sales1]);
      await asUser(c, UID.sales2);
      await expect(createManualQuote("남의고객", COMPANY)).rejects.toThrow();
    });
  });

  test("본인 담당 고객은 연결 허용(view_all 없어도)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
      await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales2]);
      await c.query("insert into public.companies (id, name, assignee_id) values ($1,'내고객',$2)", [COMPANY, UID.sales2]);
      await asUser(c, UID.sales2);
      const res = await createManualQuote("내고객", COMPANY);
      expect(res.application_id).toBeTruthy();
    });
  });

  test("view_all 보유자는 담당 아니어도 연결 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed(); // sales1 = quotes.write + customers.view_all, COMPANY 무담당
      await asUser(c, UID.sales1);
      const res = await createManualQuote("연결고객", COMPANY);
      expect(res.application_id).toBeTruthy();
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
