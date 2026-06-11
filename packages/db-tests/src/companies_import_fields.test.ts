import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 거래처 엑셀 이관 — companies에 ledger_no(구 시스템 장부번호, 대조키)·mobile(휴대폰) 추가.
// 단순 사용자 편집 컬럼이라 RLS 변경 없음(#5a와 동일 패턴).
let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seedEditor(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "imp-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.edit,customers.view_all}' where id=$1", [UID.admin]);
}

describe("companies 이관 필드(ledger_no·mobile)", () => {
  test("customers.edit → ledger_no·mobile INSERT/SELECT 왕복", async () => {
    await inRollbackTx(c, async () => {
      await seedEditor();
      await asUser(c, UID.admin);
      const id = (await c.query(
        "insert into public.companies (name, assignee_id, ledger_no, mobile) values ('이관사', $1, 102, '010-1234-5678') returning id",
        [UID.admin],
      )).rows[0].id;
      await asPostgres(c);
      const row = (await c.query("select ledger_no, mobile from public.companies where id=$1", [id])).rows[0];
      expect(row.ledger_no).toBe(102);
      expect(row.mobile).toBe("010-1234-5678");
    });
  });

  test("ledger_no 중복은 거부(구 시스템 대조키 — 부분 UNIQUE)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      // null은 여러 행 허용(부분 인덱스) — 위반은 tx를 abort시키므로 마지막에.
      await c.query("insert into public.companies (name) values ('병')");
      await c.query("insert into public.companies (name) values ('정')");
      await c.query("insert into public.companies (name, ledger_no) values ('갑', 500)");
      await expect(
        c.query("insert into public.companies (name, ledger_no) values ('을', 500)"),
      ).rejects.toThrow();
    });
  });

  test("mobile 길이 50자 초과 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expect(
        c.query("insert into public.companies (name, mobile) values ('가', $1)", ["0".repeat(51)]),
      ).rejects.toThrow();
    });
  });

  test("ledger_no 0 이하 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expect(
        c.query("insert into public.companies (name, ledger_no) values ('나', 0)"),
      ).rejects.toThrow();
    });
  });
});
