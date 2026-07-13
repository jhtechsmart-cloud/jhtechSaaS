// check_company_duplicate RPC 통합 테스트 — RLS 우회(SECURITY DEFINER) 전 고객 대상 중복 조회.
// ① 사업자번호 정확일치 ② 회사명(공백제거·소문자, 전각공백 포함)+전화(숫자) 동시일치.
// authenticated만 실행(anon 차단). E1 하니스(helpers.ts) 재사용.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

type DupResult = {
  company_id: string;
  name: string;
  ceo: string | null;
  match: "biz_no" | "name_phone";
} | null;

async function callDup(
  client: Client,
  bizNo: string,
  name: string,
  phone: string,
  excludeId: string | null,
): Promise<DupResult> {
  const r = await client.query(
    "select public.check_company_duplicate($1,$2,$3,$4) as r",
    [bizNo, name, phone, excludeId],
  );
  return r.rows[0].r as DupResult;
}

/** 시드: 회사 A(사업자번호 보유)·회사 B(사업자번호 없음, 이름에 전각공백 포함). */
async function seed(): Promise<{ companyAId: string; companyBId: string }> {
  await asPostgres(c);
  const a = await c.query(
    "insert into public.companies (name, biz_no, ceo, mobile) values ($1,$2,$3,$4) returning id",
    ["재현테크", "2208162517", "조선제", "01011112222"],
  );
  // 저장값 자체에 전각공백(U+3000)이 섞인 케이스 — 과거 엑셀 이관 데이터 등으로 흔함.
  const b = await c.query(
    "insert into public.companies (name, ceo, phone1) values ($1,$2,$3) returning id",
    ["　재현산업　테크　", "김대표", "010-3333-4444"],
  );
  return { companyAId: a.rows[0].id, companyBId: b.rows[0].id };
}

describe("check_company_duplicate RPC", () => {
  test("사업자번호 정확 일치(하이픈 포함 입력) → biz_no 매치 + 최소필드", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "220-81-62517", "", "", null);
      expect(r).not.toBeNull();
      expect(r?.match).toBe("biz_no");
      expect(r?.company_id).toBe(companyAId);
      expect(r?.name).toBe("재현테크");
      expect(r?.ceo).toBe("조선제");
      expect(Object.keys(r!).sort()).toEqual(["ceo", "company_id", "match", "name"]);
    });
  });

  test("회사명+전화 일치(사업자번호 없이, 전화 하이픈 입력) → name_phone 매치", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "", "재현테크", "010-1111-2222", null);
      expect(r?.match).toBe("name_phone");
      expect(r?.name).toBe("재현테크");
    });
  });

  test("저장된 회사명에 전각공백 포함 + 입력은 공백 없는 이름 → 정규화 일치(name_phone)", async () => {
    await inRollbackTx(c, async () => {
      const { companyBId } = await seed();
      await asUser(c, UID.sales1);
      // 저장값: '　재현산업　테크　' → 정규화 후 '재현산업테크'. 입력값은 공백 전혀 없이 동일 문자열.
      const r = await callDup(c, "", "재현산업테크", "01033334444", null);
      expect(r?.match).toBe("name_phone");
      expect(r?.company_id).toBe(companyBId);
    });
  });

  test("입력 이름에 전각공백 포함 + 저장값은 공백 없음 → 정규화 일치(name_phone)", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      // 입력값에 전각공백을 섞어도(엑셀 붙여넣기 시나리오) 정규화되어 매치되어야 한다.
      const r = await callDup(c, "", "재현　테크", "01011112222", null);
      expect(r?.match).toBe("name_phone");
      expect(r?.company_id).toBe(companyAId);
    });
  });

  test("이름은 같으나 전화가 다르면 매치 없음(null)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "", "재현테크", "01099998888", null);
      expect(r).toBeNull();
    });
  });

  test("exclude_id로 자기 자신 제외 → null", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "2208162517", "", "", companyAId);
      expect(r).toBeNull();
    });
  });

  test("아무 것도 일치하지 않으면 null", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "9999999999", "존재안함", "01000000000", null);
      expect(r).toBeNull();
    });
  });

  test("anon은 실행 불가(권한 없음)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asAnon(c);
      await expect(
        c.query("select public.check_company_duplicate($1,$2,$3,$4)", [
          "2208162517",
          "",
          "",
          null,
        ]),
      ).rejects.toThrow();
    });
  });
});
