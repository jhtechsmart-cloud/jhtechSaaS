// check_company_duplicate RPC 통합 테스트 — RLS 우회(SECURITY DEFINER) 전 고객 대상 중복 조회.
// ① 사업자번호 정확일치 ② 회사명(공백제거·소문자, 전각공백 포함)+전화(숫자) 동시일치
// ③ 회사명 단독일치(name_only — 저장 차단이 아닌 '확인 후 진행' 경고용, 배너 표시용 추가 필드 포함).
// authenticated만 실행(anon 차단). E1 하니스(helpers.ts) 재사용.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, UID } from "./helpers";

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
  match: "biz_no" | "name_phone" | "name_only";
  // name_only 매치에만 포함 — 경고 배너에 기존 고객 정보 표시용.
  biz_no?: string | null;
  manager?: string | null;
  address?: string | null;
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

  test("이름은 같으나 전화가 다르면 name_only 매치(경고용) + 배너 필드 포함", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "", "재현테크", "01099998888", null);
      expect(r?.match).toBe("name_only");
      expect(r?.company_id).toBe(companyAId);
      // 경고 배너 표시용 추가 필드 — 기존 고객의 사업자번호·담당자·주소.
      expect(r?.biz_no).toBe("2208162517");
      expect(r).toHaveProperty("manager");
      expect(r).toHaveProperty("address");
    });
  });

  test("사업자번호가 다르고 이름만 같아도 name_only 매치(전화 미입력)", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      // 사업자번호는 10자리이지만 미등록 번호 → ①불발, 전화 없음 → ②불발, 이름 일치 → ③.
      const r = await callDup(c, "9999999999", "재현　테크", "", null);
      expect(r?.match).toBe("name_only");
      expect(r?.company_id).toBe(companyAId);
    });
  });

  test("사업자번호 일치가 name_only보다 우선", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      // 이름도 같고 사업자번호도 같음 → ① biz_no 매치가 우선.
      const r = await callDup(c, "2208162517", "재현테크", "", null);
      expect(r?.match).toBe("biz_no");
      expect(r?.company_id).toBe(companyAId);
    });
  });

  test("name_only도 exclude_id로 자기 자신 제외 → null", async () => {
    await inRollbackTx(c, async () => {
      const { companyAId } = await seed();
      await asUser(c, UID.sales1);
      const r = await callDup(c, "", "재현테크", "", companyAId);
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

  test("anon EXECUTE 권한 없음 / authenticated 있음", async () => {
    // 함수를 실제 호출하지 않고 정적 ACL만 검사한다.
    // (이 로컬 Docker 이미지에서는 role-switch 후 함수를 호출하는 경로가
    // "Connection terminated unexpectedly"로 크래시해 실제 권한거부와 구분이 안 된다 —
    // 무관한 RPC에서도 재현되는 환경 버그. has_function_privilege는 호출 없이
    // grant/revoke 상태만 조회하므로 크래시를 우회하면서도 결정적이다.)
    await asPostgres(c);
    const r = await c.query(
      `select
         has_function_privilege('anon', 'public.check_company_duplicate(text,text,text,uuid)', 'execute') as anon_exec,
         has_function_privilege('authenticated', 'public.check_company_duplicate(text,text,text,uuid)', 'execute') as auth_exec`,
    );
    expect(r.rows[0].anon_exec).toBe(false);
    expect(r.rows[0].auth_exec).toBe(true);
  });
});
