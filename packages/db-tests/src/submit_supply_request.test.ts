// M2 P-E #23 — submit_supply_request RPC. anon 제출(서버가 모든 값 검증·강제).
// 등록고객 전용(미등록=거부). 동의·체크섬·신청자 필수. items는 보유장비 매칭 active 소모품만, qty 1..9999 정수.
// 매칭 검증은 list_consumables_for_company 결과를 단일소스로 재사용(C2). status·assignee 하드코딩.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const EQ_UV = "00000000-0000-0000-0000-0000000000e1";

// 등록고객(담당=sales1) + 보유장비(UVA) + 매칭 소모품(ink·clean) + 미매칭(blade) + 단종(dead). ids 반환.
async function seed(): Promise<{ companyId: string; ink: string; clean: string; blade: string; dead: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "ssr-sales1@jhtech.test");
  await c.query("update public.profiles set name='김영업' where id=$1", [UID.sales1]);
  const printer = (await c.query("insert into public.equipment_category (name) values ('프린터') returning id")).rows[0].id;
  const uv = (await c.query("insert into public.equipment_category (parent_id,name) values ($1,'UV프린터') returning id", [printer])).rows[0].id;
  const cut = (await c.query("insert into public.equipment_category (name) values ('커팅기') returning id")).rows[0].id;
  await c.query("insert into public.equipment (id,name,category_id,base_price,status) values ($1,'UVA',$2,1,'active')", [EQ_UV, uv]);
  const ink = (await c.query("insert into public.consumables (name,unit,price) values ('UV잉크','개',50000) returning id")).rows[0].id;
  const clean = (await c.query("insert into public.consumables (name,unit) values ('세정액','병') returning id")).rows[0].id;
  const blade = (await c.query("insert into public.consumables (name) values ('칼날') returning id")).rows[0].id; // 미매칭(커팅기 분류)
  const dead = (await c.query("insert into public.consumables (name,status) values ('단종','inactive') returning id")).rows[0].id;
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [ink, uv]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [clean, printer]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [blade, cut]);
  await c.query("insert into public.consumable_scope (consumable_id,category_id) values ($1,$2)", [dead, printer]);
  const co = (await c.query("insert into public.companies (name, biz_no, assignee_id) values ('소모품상사','1234567891',$1) returning id", [UID.sales1])).rows[0].id;
  await c.query("insert into public.company_equipment (company_id, equipment_id) values ($1,$2)", [co, EQ_UV]);
  return { companyId: co, ink, clean, blade, dead };
}

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    biz_no: "1234567891",
    requester_name: "구매담당",
    requester_phone: "0212345678",
    privacy_consent: true,
    privacy_consent_version: "v1.0",
    ...over,
  });

describe("submit_supply_request RPC — 정상 경로", () => {
  test("등록고객 + 매칭 소모품 → SUP- 반환 + request·items 저장 + 스냅샷·assignee", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink, clean } = await seed(); await asAnon(c);
      const r = await c.query("select public.submit_supply_request($1::jsonb) as out", [
        payload({ note: "급해요", items: [{ consumable_id: ink, qty: 3 }, { consumable_id: clean, qty: 1 }] }),
      ]);
      expect(r.rows[0].out.seq_no).toMatch(/^SUP-\d{8}-\d{5,}$/);
      expect(r.rows[0].out.assignee_name).toBe("김영업");
      await asPostgres(c);
      const req = await c.query("select id, company_id, status, assignee_id, admin_read_at, note from public.supply_requests where company_id=$1", [companyId]);
      expect(req.rows[0].company_id).toBe(companyId);
      expect(req.rows[0].status).toBe("received");
      expect(req.rows[0].assignee_id).toBe(UID.sales1);
      expect(req.rows[0].admin_read_at).toBeNull();
      expect(req.rows[0].note).toBe("급해요");
      const items = await c.query("select consumable_id, consumable_name_snapshot, consumable_unit_snapshot, qty from public.supply_request_items where request_id=$1 order by qty desc", [req.rows[0].id]);
      expect(items.rowCount).toBe(2);
      expect(items.rows[0].consumable_id).toBe(ink);
      expect(items.rows[0].consumable_name_snapshot).toBe("UV잉크"); // 서버가 카탈로그에서 스냅샷
      expect(items.rows[0].consumable_unit_snapshot).toBe("개");
      expect(items.rows[0].qty).toBe(3);
    });
  });

  test("anon은 저장 후 직접 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      await c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: [{ consumable_id: ink, qty: 1 }] })]);
      expect((await c.query("select id from public.supply_requests")).rowCount).toBe(0);
    });
  });

  test("payload의 status·seq_no·assignee_id·admin_read_at은 무시/강제", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asAnon(c);
      await c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ status: "done", seq_no: "HACK", assignee_id: UID.admin, admin_read_at: "2020-01-01", items: [{ consumable_id: ink, qty: 1 }] }),
      ]);
      await asPostgres(c);
      const row = await c.query("select status, seq_no, assignee_id, admin_read_at from public.supply_requests where company_id=$1", [companyId]);
      expect(row.rows[0].status).toBe("received");
      expect(row.rows[0].seq_no).toMatch(/^SUP-\d{8}-\d{5,}$/);
      expect(row.rows[0].assignee_id).toBe(UID.sales1);
      expect(row.rows[0].admin_read_at).toBeNull();
    });
  });

  test("name/unit 스냅샷은 클라가 보낸 값 무시하고 서버가 카탈로그에서 채운다", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink } = await seed(); await asAnon(c);
      await c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: ink, qty: 1, consumable_name_snapshot: "위조명", qty_hack: 999 }] }),
      ]);
      await asPostgres(c);
      const reqId = (await c.query("select id from public.supply_requests where company_id=$1", [companyId])).rows[0].id;
      const it = await c.query("select consumable_name_snapshot from public.supply_request_items where request_id=$1", [reqId]);
      expect(it.rows[0].consumable_name_snapshot).toBe("UV잉크");
    });
  });
});

describe("submit_supply_request RPC — items 검증", () => {
  test("빈 배열 / 비배열 / 키없음 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed(); await asAnon(c);
      await c.query("savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: [] })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: "x" })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({})])).rejects.toThrow();
    });
  });

  test("매칭 밖 소모품(미매칭·존재안함·inactive) → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { blade, dead } = await seed(); await asAnon(c);
      await c.query("savepoint sp");
      // 미매칭(칼날=커팅기)
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: [{ consumable_id: blade, qty: 1 }] })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      // 존재하지 않는 uuid
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: [{ consumable_id: "00000000-0000-0000-0000-0000000000ff", qty: 1 }] })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      // inactive(단종, 분류는 매칭이지만 active 아님)
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items: [{ consumable_id: dead, qty: 1 }] })])).rejects.toThrow();
    });
  });

  test("중복 consumable_id → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: ink, qty: 1 }, { consumable_id: ink, qty: 2 }] }),
      ])).rejects.toThrow();
    });
  });

  test("qty 0 / 음수 / 10000초과 / 소수 / 문자열 / 누락 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      for (const bad of [0, -1, 10000, 2.5, "5", null]) {
        await c.query("savepoint sp");
        await expect(c.query("select public.submit_supply_request($1::jsonb)", [
          payload({ items: [{ consumable_id: ink, qty: bad }] }),
        ])).rejects.toThrow();
        await c.query("rollback to savepoint sp");
      }
      // qty 키 자체 누락 → 거부
      await c.query("savepoint sp2");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: ink }] }),
      ])).rejects.toThrow();
      await c.query("rollback to savepoint sp2");
    });
  });

  test("qty 허용 경계(1·9999) 정상 접수 — 상한 회귀 방지 양성 단언", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ink, clean } = await seed(); await asAnon(c);
      await c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: ink, qty: 1 }, { consumable_id: clean, qty: 9999 }] }),
      ]);
      await asPostgres(c);
      const reqId = (await c.query("select id from public.supply_requests where company_id=$1", [companyId])).rows[0].id;
      const qtys = (await c.query("select qty from public.supply_request_items where request_id=$1 order by qty", [reqId])).rows.map((r: { qty: number }) => r.qty);
      expect(qtys).toEqual([1, 9999]);
    });
  });
});

describe("submit_supply_request RPC — 등록·동의·체크섬·신청자", () => {
  test("미등록(회사 없음) biz_no → 거부(등록고객 전용)", async () => {
    await inRollbackTx(c, async () => {
      // 회사 없이 장비/소모품만 없음 — biz는 valid checksum이나 company 미존재
      await asAnon(c);
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: "00000000-0000-0000-0000-0000000000ff", qty: 1 }] }),
      ])).rejects.toThrow();
    });
  });

  test("동의 false/문자열/버전위조 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      const items = [{ consumable_id: ink, qty: 1 }];
      await c.query("savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, privacy_consent: false })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, privacy_consent: "true" })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, privacy_consent_version: "v999" })])).rejects.toThrow();
    });
  });

  test("biz_no 체크섬 불일치 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ biz_no: "1234567890", items: [{ consumable_id: ink, qty: 1 }] }),
      ])).rejects.toThrow();
    });
  });

  test("신청자명/연락처 누락 → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      const items = [{ consumable_id: ink, qty: 1 }];
      await c.query("savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, requester_name: "" })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, requester_phone: "" })])).rejects.toThrow();
    });
  });

  test("신청자명>100자 / 연락처>50자 → 거부(서버 길이 가드)", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      const items = [{ consumable_id: ink, qty: 1 }];
      await c.query("savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, requester_name: "가".repeat(101) })])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [payload({ items, requester_phone: "0".repeat(51) })])).rejects.toThrow();
    });
  });

  test("note 길이 초과(>2000) → 거부", async () => {
    await inRollbackTx(c, async () => {
      const { ink } = await seed(); await asAnon(c);
      await expect(c.query("select public.submit_supply_request($1::jsonb)", [
        payload({ items: [{ consumable_id: ink, qty: 1 }], note: "가".repeat(2001) }),
      ])).rejects.toThrow();
    });
  });
});
