import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// #5a — companies 확장 8필드(담당자·업태·장부명·전화1/2·팩스·실제주소1/2).
// 단순 사용자 편집 컬럼이라 RLS 변경 없음 → customers.edit 권한자가 쓰고 읽는지 + 길이 CHECK만 단언.
let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seedEditor(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "ext-admin@jhtech.test");
  // companies_insert=customers.edit, companies_update=edit + (self|view_all).
  await c.query("update public.profiles set permissions='{customers.edit,customers.view_all}' where id=$1", [UID.admin]);
}

describe("companies 확장 필드(#5a)", () => {
  test("customers.edit → 8개 신규 필드 INSERT/SELECT 왕복", async () => {
    await inRollbackTx(c, async () => {
      await seedEditor();
      await asUser(c, UID.admin);
      const id = (await c.query(
        `insert into public.companies
           (name, assignee_id, manager, biz_type, biz_item, ledger_name, phone1, phone2, fax, address_actual1, address_actual2)
         values ('확장사', $1, '김담당', '제조', '금속가공', '장부-001', '02-111-2222', '031-333-4444', '02-555-6666', '대전 실제1', '대전 실제2')
         returning id`,
        [UID.admin],
      )).rows[0].id;
      await asPostgres(c);
      const row = (await c.query(
        "select manager, biz_type, biz_item, ledger_name, phone1, phone2, fax, address_actual1, address_actual2 from public.companies where id=$1",
        [id],
      )).rows[0];
      expect(row.manager).toBe("김담당");
      expect(row.biz_type).toBe("제조");
      expect(row.biz_item).toBe("금속가공");
      expect(row.ledger_name).toBe("장부-001");
      expect(row.phone1).toBe("02-111-2222");
      expect(row.phone2).toBe("031-333-4444");
      expect(row.fax).toBe("02-555-6666");
      expect(row.address_actual1).toBe("대전 실제1");
      expect(row.address_actual2).toBe("대전 실제2");
    });
  });

  test("customers.edit → 신규 필드 UPDATE 반영", async () => {
    await inRollbackTx(c, async () => {
      await seedEditor();
      await asUser(c, UID.admin);
      const id = (await c.query(
        "insert into public.companies (name, assignee_id) values ('수정대상', $1) returning id", [UID.admin],
      )).rows[0].id;
      await c.query("update public.companies set manager='이담당', fax='02-000-0000' where id=$1", [id]);
      await asPostgres(c);
      const row = (await c.query("select manager, fax from public.companies where id=$1", [id])).rows[0];
      expect(row.manager).toBe("이담당");
      expect(row.fax).toBe("02-000-0000");
    });
  });

  test("길이 CHECK — manager 201자는 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedEditor();
      await asUser(c, UID.admin);
      await expect(
        c.query("insert into public.companies (name, assignee_id, manager) values ('초과', $1, $2)", [UID.admin, "가".repeat(201)]),
      ).rejects.toThrow(/companies_manager_len/);
    });
  });
});
