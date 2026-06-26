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

const CO1 = "00000000-0000-0000-0000-00000000c001"; // sales1 담당
const CO2 = "00000000-0000-0000-0000-00000000c002"; // sales2 담당

// sales1=CO1 담당, sales2=CO2 담당. admin=customers.view_all.
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await c.query("update public.profiles set permissions='{customers.view_all,users.manage}' where id=$1", [UID.admin]);
  await c.query("insert into public.companies (id, name, assignee_id) values ($1,'가나기업',$2)", [CO1, UID.sales1]);
  await c.query("insert into public.companies (id, name, assignee_id) values ($1,'다라기업',$2)", [CO2, UID.sales2]);
}

describe("sales_logs — 영업일지 RLS·서버강제", () => {
  test("담당 영업은 자기 고객에 작성하고 조회한다 + author_id는 auth.uid()로 강제", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      // author_id를 sales2로 위조해 넣어도 트리거가 sales1로 덮어쓴다.
      const ins = await c.query(
        "insert into public.sales_logs (company_id, author_id, content) values ($1,$2,$3) returning id, author_id",
        [CO1, UID.sales2, "헤드 3개로 견적 요청 예정"],
      );
      expect(ins.rows[0].author_id).toBe(UID.sales1); // 위조 무시·서버 강제
      const sel = await c.query("select content from public.sales_logs where company_id=$1", [CO1]);
      expect(sel.rows).toHaveLength(1);
      expect(sel.rows[0].content).toBe("헤드 3개로 견적 요청 예정");
    });
  });

  test("타 담당 영업은 남의 고객 영업일지를 못 본다(RLS)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO1, "비공개 메모"]);
      // sales2는 CO1 담당 아님 + view_all 없음 → 안 보임.
      await asUser(c, UID.sales2);
      const sel = await c.query("select id from public.sales_logs where company_id=$1", [CO1]);
      expect(sel.rows).toHaveLength(0);
    });
  });

  test("타 담당 영업은 남의 고객에 작성할 수 없다(INSERT 거부)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO1, "침투 메모"]),
      ).rejects.toThrow();
    });
  });

  test("customers.view_all(관리자)은 모든 고객 영업일지를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO1, "CO1 메모"]);
      await asUser(c, UID.sales2);
      await c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO2, "CO2 메모"]);
      await asUser(c, UID.admin);
      const sel = await c.query("select company_id from public.sales_logs order by content");
      expect(sel.rows).toHaveLength(2);
    });
  });

  test("삭제는 작성자 본인만 — 타인은 거부(행 0)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const ins = await c.query("insert into public.sales_logs (company_id, content) values ($1,$2) returning id", [CO1, "삭제 대상"]);
      const logId = ins.rows[0].id;
      // sales2가 view_all 부여받아 조회는 되더라도, 삭제는 작성자/users.manage만 — sales2는 둘 다 없음.
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{customers.view_all}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      const del = await c.query("delete from public.sales_logs where id=$1", [logId]);
      expect(del.rowCount).toBe(0); // RLS로 대상 행 미노출 → 삭제 0건
      // 작성자 본인은 삭제 성공.
      await asUser(c, UID.sales1);
      const del2 = await c.query("delete from public.sales_logs where id=$1", [logId]);
      expect(del2.rowCount).toBe(1);
    });
  });

  test("내용 길이 제약: 빈 문자열·4000자 초과 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO1, ""]),
      ).rejects.toThrow();
      await expect(
        c.query("insert into public.sales_logs (company_id, content) values ($1,$2)", [CO1, "x".repeat(4001)]),
      ).rejects.toThrow();
    });
  });

  test("company_id·created_at은 UPDATE로 못 바꾼다(불변)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const ins = await c.query(
        "insert into public.sales_logs (company_id, content) values ($1,$2) returning id, created_at",
        [CO1, "원본"],
      );
      const logId = ins.rows[0].id;
      const created = ins.rows[0].created_at;
      // company_id를 CO2로, created_at을 과거로 바꾸려 해도 트리거가 OLD 보존.
      await c.query(
        "update public.sales_logs set content='수정', company_id=$2, created_at='2000-01-01' where id=$1",
        [logId, CO2],
      );
      const row = await c.query("select company_id, content, created_at from public.sales_logs where id=$1", [logId]);
      expect(row.rows[0].company_id).toBe(CO1); // 불변
      expect(row.rows[0].content).toBe("수정"); // 내용은 수정됨
      expect(new Date(row.rows[0].created_at).getTime()).toBe(new Date(created).getTime()); // 불변
    });
  });
});
