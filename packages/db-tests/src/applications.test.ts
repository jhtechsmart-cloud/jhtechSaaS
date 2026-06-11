import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asAnon,
  asPostgres,
  asUser,
  inRollbackTx,
  makeClient,
  seedAuthUser,
  UID,
} from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

describe("applications — seq_no 채번 (전역 sequence)", () => {
  test("INSERT 시 seq_no가 REQ-YYYYMMDD-NNNNN 형식으로 자동 생성", async () => {
    await inRollbackTx(c, async () => {
      // anon 직접 INSERT는 정책 제거(RPC 전용) — 트리거 검증은 postgres 컨텍스트로.
      await asPostgres(c);
      await c.query("insert into public.applications (company) values ('테스트상사')");
      const r = await c.query(
        "select seq_no from public.applications where company='테스트상사'",
      );
      // 최소 5자리(10만 건 넘으면 자릿수 증가 → \d{5,})
      expect(r.rows[0].seq_no).toMatch(/^REQ-\d{8}-\d{5,}$/);
    });
  });

  test("seq_no 날짜는 KST(Asia/Seoul) 기준", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.applications (company) values ('KST상사')");
      const r = await c.query(
        "select seq_no, to_char(now() at time zone 'Asia/Seoul','YYYYMMDD') kst from public.applications where company='KST상사'",
      );
      expect(r.rows[0].seq_no).toContain(`REQ-${r.rows[0].kst}-`);
    });
  });

  test("채번 유일성: 100행 → seq_no 100개 모두 유일", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(
        "insert into public.applications (company) select 'c' || g from generate_series(1,100) g",
      );
      const r = await c.query(
        "select count(*)::int total, count(distinct seq_no)::int uniq from public.applications",
      );
      expect(r.rows[0].total).toBe(100);
      expect(r.rows[0].uniq).toBe(100);
    });
  });

  test("10만 건 경계: seq_no가 잘리지 않고 자릿수가 늘어 충돌 없음 (lpad 잘림 회귀)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("select setval('public.application_seq', 99998)");
      // 99999, 100000, 100001 → 5,6,6자리, 모두 달라야 함
      await c.query(
        "insert into public.applications (company) select 'b' || g from generate_series(1,3) g",
      );
      const r = await c.query(
        "select count(distinct seq_no)::int uniq from public.applications",
      );
      expect(r.rows[0].uniq).toBe(3);
      // 100000은 잘리지 않고 6자리로 보존되어야(잘리면 '10000'이 되어 충돌).
      const has = await c.query(
        "select 1 from public.applications where seq_no like '%-100000'",
      );
      expect(has.rowCount).toBe(1);
    });
  });

  test("INSERT 시 seq_no를 지정해도 서버 생성값으로 덮어쓴다(역할 불문 트리거 강제)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(
        "insert into public.applications (company, seq_no) values ('위조','REQ-19700101-00001')",
      );
      const r = await c.query(
        "select seq_no from public.applications where company='위조'",
      );
      expect(r.rows[0].seq_no).not.toBe("REQ-19700101-00001");
      expect(r.rows[0].seq_no).toMatch(/^REQ-\d{8}-\d{5,}$/);
    });
  });

  test("UPDATE로 seq_no를 바꿔도 OLD 값이 보존된다(불변)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query(
        "insert into public.applications (id, company, assignee_id) values ('00000000-0000-0000-0000-00000000d001','보존',$1)",
        [UID.sales1],
      );
      const before = await c.query(
        "select seq_no from public.applications where company='보존'",
      );
      await asUser(c, UID.sales1);
      await c.query(
        "update public.applications set seq_no='REQ-19700101-00001', status='assigned' where company='보존'",
      );
      await asPostgres(c);
      const after = await c.query(
        "select seq_no, status from public.applications where company='보존'",
      );
      expect(after.rows[0].seq_no).toBe(before.rows[0].seq_no); // 불변
      expect(after.rows[0].status).toBe("assigned"); // 일반 컬럼은 수정됨
    });
  });
});

describe("applications — anon 직접 INSERT 전면 차단(RPC 전용)", () => {
  // 공개 신청은 submit_application RPC(동의·biz_no 체크섬·장비 active 서버검증)로만.
  // 직접 INSERT 정책이 남아 있으면 검증을 우회해 동의 기록 없는 행이 생긴다.
  test("anon은 정상 형태(status=new, 미배정)로도 직접 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company) values ('가나다')"),
      ).rejects.toThrow();
    });
  });


  test("anon이 status!=new로 INSERT 시 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company, status) values ('x','assigned')"),
      ).rejects.toThrow();
    });
  });

  test("anon이 assignee_id 지정 시 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await asAnon(c);
      await expect(
        c.query("insert into public.applications (company, assignee_id) values ('x',$1)", [UID.sales1]),
      ).rejects.toThrow();
    });
  });

  test("anon은 applications를 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.applications (company) values ('비밀상사')");
      await asAnon(c);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(0);
    });
  });
});

describe("applications — 동의 3컬럼 + equipment_id FK (M2 P-A)", () => {
  test("applications에 동의 3컬럼 + equipment_id FK 존재", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const cols = await c.query(
        "select column_name from information_schema.columns where table_name='applications' and table_schema='public'",
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining(["privacy_consent", "privacy_consent_at", "privacy_consent_version", "equipment_id"]),
      );
      const fk = await c.query(
        `select 1 from information_schema.table_constraints tc
         join information_schema.constraint_column_usage ccu on tc.constraint_name=ccu.constraint_name
         where tc.table_name='applications' and tc.constraint_type='FOREIGN KEY' and ccu.table_name='equipment'`,
      );
      expect(fk.rowCount).toBeGreaterThan(0);
    });
  });
});

describe("applications — assignee row scope (E-4)", () => {
  const APP1 = "00000000-0000-0000-0000-0000000000f1";
  const APP2 = "00000000-0000-0000-0000-0000000000f2";

  async function seedScoped(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
    await seedAuthUser(c, UID.admin, "admin@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,assignee_id) values ($1,'A',$2),($3,'B',$4)", [APP1, UID.sales1, APP2, UID.sales2]);
  }

  test("view_all 없는 사용자는 자기 배정 건만 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedScoped();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.applications");
      expect(r.rows.map((x) => x.id)).toEqual([APP1]);
    });
  });

  test("applications.view_all 보유자는 전체를 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedScoped();
      await asUser(c, UID.admin);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(2);
    });
  });
});

describe("applications — 배정·상태 UPDATE (E-4 트리아지)", () => {
  const APP = "00000000-0000-0000-0000-0000000000e1";

  async function seedNew(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.admin, "admin@jhtech.test");
    await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.assign,applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,status) values ($1,'배정대상','new')", [APP]);
  }

  test("assign 보유자가 타인에게 배정 → assignee_id 저장(WITH CHECK 통과)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asUser(c, UID.admin);
      const r = await c.query(
        "update public.applications set assignee_id=$1, status='assigned' where id=$2 returning assignee_id,status",
        [UID.sales1, APP],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
      expect(r.rows[0].status).toBe("assigned");
    });
  });

  test("assign 없는 사용자의 UPDATE는 0행(RLS 거부 — 거짓성공 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      // sales2: 권한 없음, 본인 배정건도 아님
      await asUser(c, UID.sales2);
      const r = await c.query(
        "update public.applications set status='closed' where id=$1 returning id",
        [APP],
      );
      expect(r.rowCount).toBe(0); // 에러가 아니라 0행 — 앱 레이어가 이걸 에러로 변환
    });
  });

  test("status check enum 위반은 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.applications set status='done' where id=$1", [APP]),
      ).rejects.toThrow();
    });
  });

  test("UPDATE 후 seq_no·created_at 불변(트리거)", async () => {
    await inRollbackTx(c, async () => {
      await seedNew();
      await asPostgres(c);
      const before = await c.query("select seq_no,created_at from public.applications where id=$1", [APP]);
      await asUser(c, UID.admin);
      await c.query("update public.applications set status='quoted' where id=$1", [APP]);
      await asPostgres(c);
      const after = await c.query("select seq_no,created_at,status from public.applications where id=$1", [APP]);
      expect(after.rows[0].seq_no).toBe(before.rows[0].seq_no);
      expect(after.rows[0].created_at).toEqual(before.rows[0].created_at);
      expect(after.rows[0].status).toBe("quoted");
    });
  });
});

describe("applications — biz_no 정규화 매칭(P-F 역링크 등록 경로)", () => {
  const APP_HY = "00000000-0000-0000-0000-0000000000e2";

  test("하이픈 application → upsert → companies 숫자저장 → 정규화 .eq 매칭 성공", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.admin, "admin@jhtech.test");
      await c.query("update public.profiles set permissions='{customers.edit}' where id=$1", [UID.admin]); // E5a: upsert 게이트 = customers.edit
      // application은 하이픈 포함 biz_no(anon 직접 POST 잔류 시나리오).
      await c.query(
        "insert into public.applications (id,company,biz_no) values ($1,'정규화상사','123-45-67890')",
        [APP_HY],
      );

      // upsert_company_from_application(admin, customers.edit) → companies 생성.
      await asUser(c, UID.admin);
      await c.query("select public.upsert_company_from_application($1)", [APP_HY]);

      // companies.biz_no는 숫자정규화 저장돼야 한다.
      await asPostgres(c);
      const co = await c.query("select biz_no from public.companies where source_application_id=$1", [APP_HY]);
      expect(co.rows[0].biz_no).toBe("1234567890");

      // getApplicationForAdmin 매칭 등가: application biz_no 정규화('1234567890')로 .eq 조회 → 1행.
      const match = await c.query(
        "select id from public.companies where biz_no = regexp_replace($1,'\\D','','g')",
        ["123-45-67890"],
      );
      expect(match.rowCount).toBe(1);
    });
  });
});

describe("applications — self-claim 스코프 (E5a step3)", () => {
  const POOL = "00000000-0000-0000-0000-0000000000c1"; // 미배정 'new'
  const OTHER = "00000000-0000-0000-0000-0000000000c2"; // 타인(sales2) 배정

  // sales1 = claim+status만(view_all·assign 없음), sales2 = 권한 없음.
  async function seedClaim(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "c-sales1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "c-sales2@jhtech.test");
    await c.query("update public.profiles set permissions='{applications.claim,applications.status}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
    await c.query("insert into public.applications (id,company,status) values ($1,'미배정상사','new')", [POOL]);
    await c.query("insert into public.applications (id,company,status,assignee_id) values ($1,'타인상사','assigned',$2)", [OTHER, UID.sales2]);
  }

  test("claim 보유자는 미배정 신청을 SELECT로 본다(타인 배정건은 안 보임)", async () => {
    await inRollbackTx(c, async () => {
      await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query("select id from public.applications");
      expect(r.rows.map((x) => x.id)).toEqual([POOL]);
    });
  });

  test("claim 보유자가 미배정 신청을 본인으로 가져온다(assignee=uid, new→assigned)", async () => {
    await inRollbackTx(c, async () => {
      await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.applications set assignee_id=$1, status='assigned' where id=$2 and assignee_id is null returning assignee_id,status",
        [UID.sales1, POOL],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].assignee_id).toBe(UID.sales1);
      expect(r.rows[0].status).toBe("assigned");
    });
  });

  test("claim 보유자가 타인 배정 신청은 못 가져온다(IS NULL 가드 → 0행)", async () => {
    await inRollbackTx(c, async () => {
      await seedClaim();
      await asUser(c, UID.sales1);
      const r = await c.query(
        "update public.applications set assignee_id=$1 where id=$2 and assignee_id is null returning id",
        [UID.sales1, OTHER],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  test("claim 보유자가 미배정 행을 타인에게 배정하면 거부(escalation 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seedClaim();
      await asUser(c, UID.sales1);
      // USING(claim·null)은 통과하나 NEW.assignee=sales2가 WITH CHECK(본인 OR assign)에 막혀 에러.
      await expect(
        c.query("update public.applications set assignee_id=$1 where id=$2 and assignee_id is null", [UID.sales2, POOL]),
      ).rejects.toThrow();
    });
  });
});
