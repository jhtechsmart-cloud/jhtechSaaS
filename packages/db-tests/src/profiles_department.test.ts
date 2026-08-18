// profiles.department — 소속 부서(sales/tech/management/null) 컬럼 + CHECK + RLS(관리자만 변경) 검증.
// 백필(직책 문자열→부서)은 마이그레이션 1회 UPDATE라 여기선 "신규 행은 null" + 매핑 SQL 동형만 확인.
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

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "dept-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "dept-sales1@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}', is_active=true where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{customers.edit}', is_active=true where id=$1", [UID.sales1]);
}

describe("profiles.department", () => {
  test("신규 profiles의 부서 기본값은 null(미지정)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "dept-sales2@jhtech.test");
      const r = await c.query("select department from public.profiles where id=$1", [UID.sales2]);
      expect(r.rows[0].department).toBeNull();
    });
  });

  test("허용 키 3종(sales/tech/management)과 null만 저장된다 — 그 외는 CHECK 위반(23514)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      for (const v of ["sales", "tech", "management", null]) {
        const r = await c.query("update public.profiles set department=$2 where id=$1 returning department", [
          UID.sales1,
          v,
        ]);
        expect(r.rows[0].department).toBe(v);
      }
      await expect(
        c.query("update public.profiles set department='영업부' where id=$1", [UID.sales1]),
      ).rejects.toMatchObject({ code: "23514" });
      // 실패한 문장은 tx를 abort시키므로 이후 문장 없음(inRollbackTx가 롤백).
    });
  });

  test("일반 직원은 본인 부서를 바꿀 수 없다(RLS profiles_update=users.manage → 0행)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await c.query("update public.profiles set department='sales' where id=$1 returning id", [
        UID.sales1,
      ]);
      expect(r.rowCount).toBe(0);
    });
  });

  test("관리자(users.manage)는 타인의 부서를 설정·해제할 수 있다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const set = await c.query("update public.profiles set department='sales' where id=$1 returning department", [
        UID.sales1,
      ]);
      expect(set.rows[0].department).toBe("sales");
      const clear = await c.query("update public.profiles set department=null where id=$1 returning department", [
        UID.sales1,
      ]);
      expect(clear.rows[0].department).toBeNull();
    });
  });

  test("백필 규칙 동형: 직책에 영업부/기술부/관리부가 들어 있으면 그 부서, 아니면 null", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      // 마이그레이션의 CASE 식과 동일한 SQL을 표본 직책에 적용해 기대값 확인(마이그 SQL 회귀 가드).
      const r = await c.query(`
        select p, case
          when p like '%영업부%' then 'sales'
          when p like '%기술부%' then 'tech'
          when p like '%관리부%' then 'management'
          else null end as d
        from unnest(array['영업부 이사','기술부 대리','관리부 과장','대표이사','공장장','디자인팀 차장', null]) as p
      `);
      expect(r.rows.map((x) => x.d)).toEqual(["sales", "tech", "management", null, null, null, null]);
    });
  });
});
