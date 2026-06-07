import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const APP = "00000000-0000-0000-0000-00000000f001";

// sales1=quotes.write. 의뢰를 주어진 status로 시드.
async function seed(status: string): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  await c.query("insert into public.applications (id, company, status) values ($1,'견적대상',$2)", [APP, status]);
}

const ITEMS = '[{"name":"UV3300S","unitPrice":50000000,"quantity":1}]';

async function createQuote(appId: string, status: "draft" | "issued"): Promise<void> {
  await c.query("select public.create_quote($1,$2::jsonb,'[]'::jsonb,$3)", [appId, ITEMS, status]);
}

async function appStatus(appId: string): Promise<string> {
  await asPostgres(c);
  const r = await c.query("select status from public.applications where id=$1", [appId]);
  return r.rows[0].status;
}

describe("의뢰 상태 자동 전이 — 견적 저장 시", () => {
  test("draft 견적 저장 → 견적중(quoted)", async () => {
    await inRollbackTx(c, async () => {
      await seed("new");
      await asUser(c, UID.sales1);
      await createQuote(APP, "draft");
      expect(await appStatus(APP)).toBe("quoted");
    });
  });

  test("발행(issued) 견적 → 견적발송(quote_sent)", async () => {
    await inRollbackTx(c, async () => {
      await seed("assigned");
      await asUser(c, UID.sales1);
      await createQuote(APP, "issued");
      expect(await appStatus(APP)).toBe("quote_sent");
    });
  });

  test("재발행(V2 issued) → 견적발송 유지", async () => {
    await inRollbackTx(c, async () => {
      await seed("new");
      await asUser(c, UID.sales1);
      await createQuote(APP, "issued"); // V1 → quote_sent
      await createQuote(APP, "issued"); // V2
      expect(await appStatus(APP)).toBe("quote_sent");
    });
  });

  test("견적발송 상태에서 draft 저장 → 다운그레이드 안 함(견적발송 유지)", async () => {
    await inRollbackTx(c, async () => {
      await seed("new");
      await asUser(c, UID.sales1);
      await createQuote(APP, "issued"); // → quote_sent
      await createQuote(APP, "draft"); // 새 draft
      expect(await appStatus(APP)).toBe("quote_sent");
    });
  });

  test("완료(closed)는 견적 저장해도 보존(재오픈 안 함)", async () => {
    await inRollbackTx(c, async () => {
      await seed("closed");
      await asUser(c, UID.sales1);
      await createQuote(APP, "issued");
      expect(await appStatus(APP)).toBe("closed");
    });
  });

  test("수기 견적 발행 → 새 의뢰 견적발송", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "select public.create_manual_quote('수기사',null,null,null,$1::jsonb,'[]'::jsonb,'issued') as q",
        [ITEMS],
      );
      const appId = (r.rows[0].q as { application_id: string }).application_id;
      expect(await appStatus(appId)).toBe("quote_sent");
    });
  });
});
