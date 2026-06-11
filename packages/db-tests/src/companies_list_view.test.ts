import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 고객 목록 테이블 개편 — 서버사이드 검색·필터·정렬의 DB 기반:
//  ① companies.search_digits(전화·사업자번호 숫자만 generated) — 하이픈 무시 검색
//  ② applications.biz_no_digits(generated) — 견적 카운트 조인 키
//  ③ companies_list 뷰(security_invoker) — region·거래현황 카운트·최근활동(activity_at)
let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

async function seedCompany(): Promise<string> {
  await asPostgres(c);
  return (await c.query(
    `insert into public.companies (name, biz_no, ceo, address, phone1, mobile, ledger_no)
     values ('뷰테스트상사','1234567891','홍길동','경기도 군포시 금정동','02-552-1946','010-4219-0634', 9001)
     returning id`,
  )).rows[0].id as string;
}

describe("search_digits — 하이픈 무시 통합 검색 컬럼", () => {
  test("전화·휴대폰·사업자번호의 숫자만 모아 담는다", async () => {
    await inRollbackTx(c, async () => {
      const id = await seedCompany();
      const r = await c.query("select search_digits from public.companies where id=$1", [id]);
      const sd = r.rows[0].search_digits as string;
      expect(sd).toContain("1234567891"); // biz_no
      expect(sd).toContain("025521946");  // phone1 하이픈 제거
      expect(sd).toContain("01042190634"); // mobile 하이픈 제거
      expect(sd).not.toMatch(/-/);
    });
  });

  test("하이픈 없는 검색어로 ilike 매칭된다", async () => {
    await inRollbackTx(c, async () => {
      await seedCompany();
      const r = await c.query(
        "select count(*)::int n from public.companies where search_digits ilike '%01042190634%'",
      );
      expect(r.rows[0].n).toBe(1);
    });
  });
});

describe("companies_list 뷰", () => {
  test("region — 주소 앞부분에서 시·도 추출(경기도→경기, 전라북도→전북)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.companies (name, address) values ('지역A','경기도 군포시'),('지역B','전라북도 전주시'),('지역C','서울특별시 서초구'),('지역D',null)");
      const r = await c.query(
        "select name, region from public.companies_list where name in ('지역A','지역B','지역C','지역D') order by name",
      );
      expect(r.rows.map((x) => x.region)).toEqual(["경기", "전북", "서울", null]);
    });
  });

  test("거래현황 카운트 — 견적(biz_no 매칭)·장비·AS + activity_at(활동 없으면 null)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seedCompany();
      // 활동 전: activity_at null
      const before = await c.query("select quotes_count, equipment_count, as_count, activity_at from public.companies_list where id=$1", [id]);
      expect(before.rows[0].quotes_count).toBe(0);
      expect(before.rows[0].activity_at).toBeNull();

      // 견적(하이픈 biz_no — digits 매칭) + 장비 + AS
      await c.query("insert into public.applications (company, biz_no) values ('뷰테스트상사','123-45-67891')");
      await c.query("insert into public.company_equipment (company_id, label) values ($1,'프레스')", [id]);
      await c.query(
        `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
         values ('1234567891',$1,'뷰테스트상사','received',true,now(),'v1.0','{}'::jsonb)`,
        [id],
      );
      const after = await c.query("select quotes_count, equipment_count, as_count, activity_at from public.companies_list where id=$1", [id]);
      expect(after.rows[0].quotes_count).toBe(1);
      expect(after.rows[0].equipment_count).toBe(1);
      expect(after.rows[0].as_count).toBe(1);
      expect(after.rows[0].activity_at).not.toBeNull();
    });
  });

  test("RLS(security_invoker) — 영업은 본인 담당 고객만 뷰에서 보인다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "view-s1@jhtech.test");
      await seedAuthUser(c, UID.sales2, "view-s2@jhtech.test");
      await c.query("update public.profiles set permissions='{customers.edit}' where id in ($1,$2)", [UID.sales1, UID.sales2]);
      await c.query("insert into public.companies (name, assignee_id) values ('내고객', $1), ('남의고객', $2)", [UID.sales1, UID.sales2]);
      await asUser(c, UID.sales1);
      const r = await c.query("select name from public.companies_list where name in ('내고객','남의고객')");
      expect(r.rows.map((x) => x.name)).toEqual(["내고객"]);
    });
  });
});
