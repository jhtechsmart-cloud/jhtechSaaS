// 2026-11-20 구현현황비고 DB 버그 수정 회귀 테스트(마이그레이션 20261120100000~0500).
// #42 미연결 카운트 승인·완료 키 / #83 홈페이지 감지 quote_device_name / #84 출고번호 비잘림
// #21 발행 출고의뢰서의 FK SET NULL 허용(견적 삭제·계정 삭제) / #25 고객 가져오기 검색 범위
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const APPROVER = "00000000-0000-0000-0000-0000000000c1";
const COMPLETER = "00000000-0000-0000-0000-0000000000c2";

describe("#42 count_unlinked_company_equipment — 승인·완료 권한도 조회 가능", () => {
  test("service_reports.approve만 / complete만 가진 계정도 예외 없이 건수 반환", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, APPROVER, "fix-approver@jhtech.test");
      await seedAuthUser(c, COMPLETER, "fix-completer@jhtech.test");
      await c.query("update public.profiles set permissions='{service_reports.approve}' where id=$1", [APPROVER]);
      await c.query("update public.profiles set permissions='{service_reports.complete}' where id=$1", [COMPLETER]);
      const eq = await c.query("insert into public.equipment (name, model) values ('감사수정 UV 프린터','AF-100') returning id");
      const equipmentId = eq.rows[0].id as string;
      const co = await c.query("insert into public.companies (name) values ('감사상사') returning id");
      await c.query("insert into public.company_equipment (company_id, label) values ($1,'감사수정 UV 프린터')", [co.rows[0].id]);

      for (const uid of [APPROVER, COMPLETER]) {
        await asUser(c, uid);
        const r = await c.query("select public.count_unlinked_company_equipment($1) as n", [equipmentId]);
        expect(r.rows[0].n).toBe(1);
      }
    });
  });
});

describe("#83 equipment_wp_fields_changed — 모델명 로고 변경 감지", () => {
  test("quote_device_name만 바뀌어도 true, 반영 무관 필드(base_price)만 바뀌면 false", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const eq = await c.query("insert into public.equipment (name, base_price) values ('감지테스트',0) returning id");
      const id = eq.rows[0].id as string;
      const r = await c.query(
        `select
           public.equipment_wp_fields_changed(e, jsonb_populate_record(e, jsonb_build_object('quote_device_name', 'equipment/' || e.id || '/device-name.png'))) as name_changed,
           public.equipment_wp_fields_changed(e, jsonb_populate_record(e, '{"base_price": 12345}'::jsonb)) as price_changed
         from public.equipment e where e.id = $1`,
        [id],
      );
      expect(r.rows[0].name_changed).toBe(true);
      expect(r.rows[0].price_changed).toBe(false);
    });
  });
});

describe("#84 출고번호 — 10만 번째부터 잘리지 않음", () => {
  test("시퀀스가 100000이면 6자리 그대로(REL-YYYYMMDD-100000), 99999는 5자리", async () => {
    await asPostgres(c);
    // setval은 트랜잭션 롤백으로 되돌아가지 않으므로 원래 값을 저장해 두고 끝에 복원한다.
    const prev = (await c.query("select last_value, is_called from public.release_order_seq")).rows[0];
    try {
      await inRollbackTx(c, async () => {
        await asPostgres(c);
        await c.query("select setval('public.release_order_seq', 99998, true)");
        const a1 = await c.query("insert into public.applications (company, email) values ('번호A','a@x.com') returning id");
        const a2 = await c.query("insert into public.applications (company, email) values ('번호B','b@x.com') returning id");
        await asService(c);
        const r1 = await c.query(
          "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','A') returning seq_no",
          [a1.rows[0].id],
        );
        const r2 = await c.query(
          "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','B') returning seq_no",
          [a2.rows[0].id],
        );
        expect(r1.rows[0].seq_no).toMatch(/^REL-\d{8}-99999$/);
        expect(r2.rows[0].seq_no).toMatch(/^REL-\d{8}-100000$/);
      });
    } finally {
      await asPostgres(c);
      await c.query("select setval('public.release_order_seq', $1, $2)", [prev.last_value, prev.is_called]);
    }
  });
});

describe("#21 발행 출고의뢰서 — 참조 삭제(FK SET NULL)는 허용, 다른 값으로 변경은 계속 차단", () => {
  async function seedIssued(): Promise<{ roId: string; quoteId: string; otherQuoteId: string }> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "fix-ro-s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "fix-ro-s2@jhtech.test");
    const a = await c.query("insert into public.applications (company, email) values ('동결상사','d@x.com') returning id");
    const appId = a.rows[0].id as string;
    const q1 = await c.query(
      "insert into public.quotes (application_id, status, items) values ($1,'issued','[{\"name\":\"UV3300S\"}]') returning id",
      [appId],
    );
    const q2 = await c.query(
      "insert into public.quotes (application_id, status, items) values ($1,'issued','[{\"name\":\"UV3300S\"}]') returning id",
      [appId],
    );
    await asService(c);
    const ro = await c.query(
      "insert into public.release_orders (application_id, quote_id, device_kind, company, status, created_by) values ($1,$2,'printer','동결상사','issued',$3) returning id",
      [appId, q1.rows[0].id, UID.sales1],
    );
    return { roId: ro.rows[0].id as string, quoteId: q1.rows[0].id as string, otherQuoteId: q2.rows[0].id as string };
  }

  test("발행 출고의뢰서가 가리키는 견적 삭제 → 성공, 출고의뢰서 quote_id는 NULL", async () => {
    await inRollbackTx(c, async () => {
      const s = await seedIssued();
      await asPostgres(c);
      const del = await c.query("delete from public.quotes where id=$1", [s.quoteId]);
      expect(del.rowCount).toBe(1);
      const r = await c.query("select quote_id from public.release_orders where id=$1", [s.roId]);
      expect(r.rows[0].quote_id).toBeNull();
    });
  });

  test("발행본의 quote_id를 다른 견적으로 바꾸는 것은 여전히 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seedIssued();
      await asService(c);
      await expect(
        c.query("update public.release_orders set quote_id=$1 where id=$2", [s.otherQuoteId, s.roId]),
      ).rejects.toThrow(/발행된 출고의뢰서/);
    });
  });

  test("작성자 계정 삭제(created_by → NULL)는 허용, 다른 사람으로 변경은 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seedIssued();
      await asService(c);
      await c.query("savepoint before_reject"); // 예외 후에도 같은 트랜잭션에서 이어 검증
      await expect(
        c.query("update public.release_orders set created_by=$1 where id=$2", [UID.sales2, s.roId]),
      ).rejects.toThrow(/발행된 출고의뢰서/);
      await c.query("rollback to savepoint before_reject");
      const ok = await c.query("update public.release_orders set created_by=null where id=$1 returning created_by", [s.roId]);
      expect(ok.rows[0].created_by).toBeNull();
    });
  });
});

describe("#25 search_applications_for_customer — customers.edit는 본인 조회 범위만", () => {
  async function seedApps(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "fix-srch-s1@jhtech.test");
    await seedAuthUser(c, UID.sales2, "fix-srch-s2@jhtech.test");
    await c.query("insert into public.applications (company, email, assignee_id) values ('검색범위 내담당','a@x.com',$1)", [UID.sales1]);
    await c.query("insert into public.applications (company, email, assignee_id) values ('검색범위 타담당','b@x.com',$1)", [UID.sales2]);
    await c.query("insert into public.applications (company, email) values ('검색범위 미배정','c@x.com')");
  }
  const search = async (): Promise<string[]> =>
    (await c.query("select company from public.search_applications_for_customer('검색범위')")).rows
      .map((r) => r.company as string)
      .sort(); // DB 정렬 규칙(collation)과 무관하게 비교

  test("customers.edit만 → 본인 담당 의뢰만", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      await c.query("update public.profiles set permissions='{customers.edit}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      expect(await search()).toEqual(["검색범위 내담당"]);
    });
  });

  test("customers.edit + applications.claim → 본인 담당 + 미배정(applications RLS와 동일)", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      await c.query("update public.profiles set permissions='{customers.edit,applications.claim}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      expect(await search()).toEqual(["검색범위 내담당", "검색범위 미배정"].sort());
    });
  });

  test("customers.view_all → 전체", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      await c.query("update public.profiles set permissions='{customers.view_all}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      expect(await search()).toEqual(["검색범위 내담당", "검색범위 미배정", "검색범위 타담당"].sort());
    });
  });

  test("고객 권한 없음 → 42501", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      await expect(search()).rejects.toMatchObject({ code: "42501" });
    });
  });
});
