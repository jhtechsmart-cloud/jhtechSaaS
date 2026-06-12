import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asPostgres,
  asUser,
  inRollbackTx,
  makeClient,
  seedAuthUser,
  UID,
} from "./helpers";

// 납품 일정(delivery_date/time) — 발행(issued) 견적에도 입력 가능해야 한다.
// 동결 트리거는 명시 컬럼만 검사하므로 delivery 컬럼은 동결 대상이 아님을 고정한다(회귀 방지).

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const APP = "00000000-0000-0000-0000-00000000a777";

async function seedIssuedQuote(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await c.query(
    "update public.profiles set permissions='{quotes.write,applications.view_all}' where id=$1",
    [UID.sales1],
  );
  await c.query(
    "insert into public.applications (id, company) values ($1,'납품테스트')",
    [APP],
  );
  // 견적 INSERT는 postgres로(issued 전환 시 jobs enqueue 트리거가 RLS에 막히지 않게 —
  // 실서비스에선 RPC/서버가 수행). 검증 대상인 납품일 UPDATE는 sales1(RLS+동결 트리거)로.
  const r = await c.query(
    `insert into public.quotes (application_id, quote_no, version, status, assignee_id)
     values ($1,'tmp',1,'issued',$2) returning id`,
    [APP, UID.sales1],
  );
  await asUser(c, UID.sales1);
  return r.rows[0].id as string;
}

describe("quotes — 납품 일정 컬럼", () => {
  test("issued 견적의 delivery_date/time UPDATE 허용(동결 예외)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seedIssuedQuote();
      await c.query(
        "update public.quotes set delivery_date='2026-07-10', delivery_time='14:00' where id=$1",
        [id],
      );
      const r = await c.query(
        "select delivery_date::text d, delivery_time::text t from public.quotes where id=$1",
        [id],
      );
      expect(r.rows[0].d).toBe("2026-07-10");
      expect(r.rows[0].t).toBe("14:00:00");
    });
  });

  test("issued 견적의 items 변경은 여전히 동결 거부", async () => {
    await inRollbackTx(c, async () => {
      const id = await seedIssuedQuote();
      await expect(
        c.query(`update public.quotes set items='[{"x":1}]' where id=$1`, [id]),
      ).rejects.toThrow(/발행된 견적/);
    });
  });
});
