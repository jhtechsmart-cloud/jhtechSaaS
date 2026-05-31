import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// payload 헬퍼
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    company: "RPC상사",
    ceo: "홍길동",
    biz_no: "1234567890",
    phone: "0212345678",
    email: "a@b.com",
    address: "서울",
    fields: { requirements: "테스트", equipment_id: "00000000-0000-0000-0000-0000000000e1" },
    ...over,
  });

describe("submit_application RPC (E3 P2)", () => {
  test("anon EXECUTE → REQ- 접수번호 반환 + 행 저장(new·미배정·submitted_at·fields)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select public.submit_application($1::jsonb) as seq", [payload()]);
      expect(r.rows[0].seq).toMatch(/^REQ-\d{8}-\d{5,}$/);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id, submitted_at, fields, company from public.applications where company='RPC상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
      expect(row.rows[0].submitted_at).not.toBeNull();
      expect(row.rows[0].fields.requirements).toBe("테스트");
      expect(row.rows[0].fields.equipment_id).toBe("00000000-0000-0000-0000-0000000000e1");
    });
  });

  test("company 누락/공백 → 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ company: "   " })]),
      ).rejects.toThrow();
    });
  });

  test("company 키가 아예 없으면 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [JSON.stringify({})]),
      ).rejects.toThrow();
    });
  });

  test("길이 캡 초과(company 201자) → 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ company: "가".repeat(201) })]),
      ).rejects.toThrow();
    });
  });

  test("payload의 status·assignee_id는 무시되고 new·null 강제", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [
        payload({ company: "강제상사", status: "closed", assignee_id: "00000000-0000-0000-0000-0000000000b1" }),
      ]);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id from public.applications where company='강제상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
    });
  });

  test("anon은 RPC로 저장해도 applications를 직접 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [payload({ company: "비밀상사" })]);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(0);
    });
  });

  test("다회 호출 시 seq_no 유일", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const a = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일1" })]);
      const b = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일2" })]);
      expect(a.rows[0].seq).not.toBe(b.rows[0].seq);
    });
  });
});
