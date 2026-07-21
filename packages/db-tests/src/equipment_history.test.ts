// #243 장비 상세 AS 이력 — RLS 교차점 검증.
// 핵심: ①view만 가진 영업이 catalog_equipment_id 직접 조회로 "타 담당 고객"의 발행 리포트를
// 본다(조인 경로였다면 company_equipment RLS에 걸려 조용히 누락 — 회귀 방지의 핵심).
// ②앱 쿼리의 status 명시가 view_all 계정의 draft 혼입을 막는다.
// ③미연결 카운트 RPC는 SECURITY DEFINER — 뷰어와 무관하게 같은 숫자.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const ENG = "00000000-0000-0000-0000-0000000000b1"; // service_reports.write(기사)
const VIEWER = "00000000-0000-0000-0000-0000000000b2"; // service_reports.view만(영업)
const FULL = "00000000-0000-0000-0000-0000000000b3"; // service_reports.view_all
const OTHER_SALES = "00000000-0000-0000-0000-0000000000b4"; // 타 영업(고객 담당자)

interface Seeded {
  equipmentId: string;
  companyId: string;
  issuedId: string;
  draftId: string;
}

async function seed(): Promise<Seeded> {
  await asPostgres(c);
  await seedAuthUser(c, ENG, "eh-eng@jhtech.test");
  await seedAuthUser(c, VIEWER, "eh-viewer@jhtech.test");
  await seedAuthUser(c, FULL, "eh-full@jhtech.test");
  await seedAuthUser(c, OTHER_SALES, "eh-other@jhtech.test");
  await c.query("update public.profiles set permissions='{service_reports.write}' where id=$1", [ENG]);
  await c.query("update public.profiles set permissions='{service_reports.view}' where id=$1", [VIEWER]);
  await c.query("update public.profiles set permissions='{service_reports.view_all}' where id=$1", [FULL]);

  const eq = await c.query(
    "insert into public.equipment (name, model) values ('이력테스트 UV 프린터','EH-1000') returning id",
  );
  const equipmentId = eq.rows[0].id as string;

  // 고객 담당자 = OTHER_SALES — VIEWER는 담당이 아니다(타 담당 고객 가시성 검증의 핵심 전제).
  const co = await c.query(
    "insert into public.companies (name, biz_no, assignee_id) values ('이력상사','6667778885',$1) returning id",
    [OTHER_SALES],
  );
  const companyId = co.rows[0].id as string;

  const mk = async (): Promise<string> => {
    const r = await c.query(
      `insert into public.service_reports
         (company_id, customer_name, device_name, faults, diagnosis, action_text,
          charge_type, visit_fee, created_by)
       values ($1,'이력상사','이력테스트 UV 프린터','{헤드 노즐 막힘}','진단','조치','free',0,$2)
       returning id`,
      [companyId, ENG],
    );
    return r.rows[0].id as string;
  };
  const issuedId = await mk();
  const draftId = await mk();
  // 발행 전환 + 카탈로그 연결(프로덕션 경로와 동일 — 같은 UPDATE에 합침)
  await c.query("select set_config('app.service_reports_status_change','1',true)");
  await c.query(
    "update public.service_reports set status='issued', issued_at=now(), catalog_equipment_id=$2 where id=$1",
    [issuedId, equipmentId],
  );
  // draft에도 카탈로그를 걸어 status 필터 검증에 사용(draft는 동결 대상 아님)
  await c.query("update public.service_reports set catalog_equipment_id=$2 where id=$1", [
    draftId,
    equipmentId,
  ]);
  return { equipmentId, companyId, issuedId, draftId };
}

// 앱과 동일한 이력 쿼리 모양(단일 테이블 직접 + status 명시)
async function historyIds(equipmentId: string): Promise<string[]> {
  const r = await c.query(
    `select id from public.service_reports
      where catalog_equipment_id=$1 and status in ('issued','voided')
      order by issued_at desc`,
    [equipmentId],
  );
  return r.rows.map((x) => x.id as string);
}

describe("AS 이력 조회 — catalog_equipment_id 직접 경로", () => {
  test("view만 가진 영업: 타 담당 고객의 발행 리포트가 보인다(조인이었다면 누락)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const ids = await historyIds(s.equipmentId);
      expect(ids).toEqual([s.issuedId]);
    });
  });

  test("view 영업: draft는 RLS 단계에서 이미 안 보인다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const all = await c.query(
        "select id from public.service_reports where catalog_equipment_id=$1",
        [s.equipmentId],
      );
      expect(all.rows.map((x) => x.id)).toEqual([s.issuedId]);
    });
  });

  test("view_all 계정: status 미명시면 draft가 섞인다 → 앱 쿼리 status 명시가 방어", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, FULL);
      const noFilter = await c.query(
        "select id from public.service_reports where catalog_equipment_id=$1",
        [s.equipmentId],
      );
      expect(noFilter.rows).toHaveLength(2); // draft 혼입 — RLS만 믿으면 안 되는 이유
      expect(await historyIds(s.equipmentId)).toEqual([s.issuedId]); // 앱 쿼리 모양은 안전
    });
  });

  test("타 모델 리포트는 섞이지 않는다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const eq2 = await c.query(
        "insert into public.equipment (name) values ('다른 커팅기') returning id",
      );
      await asUser(c, VIEWER);
      expect(await historyIds(eq2.rows[0].id as string)).toHaveLength(0);
    });
  });
});

describe("count_unlinked_company_equipment — 뷰어 무관 정확 건수", () => {
  async function seedUnlinked(s: Seeded): Promise<void> {
    await asPostgres(c);
    // 미연결(이름 매칭 O) 1건 + 연결됨 1건 + 이름 불일치 1건
    await c.query("insert into public.company_equipment (company_id, label) values ($1,'이력테스트 UV 프린터')", [s.companyId]);
    await c.query("insert into public.company_equipment (company_id, equipment_id) values ($1,$2)", [s.companyId, s.equipmentId]);
    await c.query("insert into public.company_equipment (company_id, label) values ($1,'전혀다른장비')", [s.companyId]);
  }

  test("view 영업(담당 아님·company_equipment 직접조회 0건)도 RPC로는 정확한 1건", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await seedUnlinked(s);
      await asUser(c, VIEWER);
      // 직접 조회는 RLS로 0건 — 안내를 직접 조회로 만들면 안 되는 이유
      const direct = await c.query(
        "select count(*)::int as n from public.company_equipment where company_id=$1",
        [s.companyId],
      );
      expect(direct.rows[0].n).toBe(0);
      const rpc = await c.query("select public.count_unlinked_company_equipment($1) as n", [s.equipmentId]);
      expect(rpc.rows[0].n).toBe(1);
    });
  });

  test("view_all 계정도 같은 숫자(뷰어 불변)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await seedUnlinked(s);
      await asUser(c, FULL);
      const rpc = await c.query("select public.count_unlinked_company_equipment($1) as n", [s.equipmentId]);
      expect(rpc.rows[0].n).toBe(1);
    });
  });
});

describe("개요 탭 데이터 — 읽기 전용 계정의 카탈로그 접근", () => {
  test("view 영업이 equipment 행을 읽을 수 있다(상세 개요 성립)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const r = await c.query("select name from public.equipment where id=$1", [s.equipmentId]);
      expect(r.rows[0]?.name).toBe("이력테스트 UV 프린터");
    });
  });

  test("view 영업은 equipment를 수정하지 못한다(읽기 전용)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const upd = await c.query("update public.equipment set name='변조' where id=$1", [s.equipmentId]);
      expect(upd.rowCount).toBe(0);
    });
  });
});
