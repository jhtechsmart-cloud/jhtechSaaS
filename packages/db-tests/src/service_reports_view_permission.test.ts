// #246 Part 1b — 읽기전용 service_reports.view 키.
// 핵심: 영업은 발행·무효본만 본다. 기사의 작성 중(draft) 문서와 그 첨부(서명 이미지·현장 사진)는
// 테이블에서도 스토리지에서도 막힌다. 스토리지가 버킷 전체를 조건 없이 열어두던 홀도 함께 닫는다.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const ENG_A = "00000000-0000-0000-0000-0000000000a1";
const ENG_B = "00000000-0000-0000-0000-0000000000a2";
const VIEWER = "00000000-0000-0000-0000-0000000000a3"; // service_reports.view만

interface Seeded { companyId: string; draftId: string; issuedId: string }

async function seed(): Promise<Seeded> {
  await asPostgres(c);
  await seedAuthUser(c, ENG_A, "vp-eng-a@jhtech.test");
  await seedAuthUser(c, ENG_B, "vp-eng-b@jhtech.test");
  await seedAuthUser(c, VIEWER, "vp-viewer@jhtech.test");
  await c.query("update public.profiles set permissions='{service_reports.write}' where id in ($1,$2)", [
    ENG_A,
    ENG_B,
  ]);
  await c.query("update public.profiles set permissions='{service_reports.view}' where id=$1", [VIEWER]);
  const co = await c.query(
    "insert into public.companies (name, biz_no) values ('권한상사','7778889991') returning id",
  );
  const companyId = co.rows[0].id as string;

  // ENG_A의 draft 1건 + 발행본 1건
  const mk = async (): Promise<string> => {
    const r = await c.query(
      `insert into public.service_reports
         (company_id, customer_name, device_name, faults, diagnosis, action_text,
          charge_type, visit_fee, created_by)
       values ($1,'권한상사','테스트장비','{접촉불량}','진단','조치','paid',10000,$2)
       returning id`,
      [companyId, ENG_A],
    );
    return r.rows[0].id as string;
  };
  const draftId = await mk();
  const issuedId = await mk();
  // 발행 상태로 직접 전환(RPC 경유 없이 — 상태 전환 플래그 사용)
  await c.query("select set_config('app.service_reports_status_change','1',true)");
  await c.query("update public.service_reports set status='issued', issued_at=now() where id=$1", [issuedId]);
  // 첨부 객체(서명) 2건 — draft/발행본 각각
  for (const id of [draftId, issuedId]) {
    await c.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ('service-reports', $1, '{"size":1024}'::jsonb)`,
      [`${id}/signature.` + "png"],
    );
  }
  return { companyId, draftId, issuedId };
}

async function visibleReportIds(): Promise<string[]> {
  const r = await c.query("select id from public.service_reports order by created_at");
  return r.rows.map((x) => x.id as string);
}

async function visibleObjectNames(): Promise<string[]> {
  const r = await c.query("select name from storage.objects where bucket_id='service-reports'");
  return r.rows.map((x) => x.name as string);
}

describe("service_reports.view — 발행본만 열람(draft 차단)", () => {
  test("view 계정: 발행본 조회 O / 타인 draft 조회 X", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const ids = await visibleReportIds();
      expect(ids).toContain(s.issuedId);
      expect(ids).not.toContain(s.draftId);
    });
  });

  test("view 계정: 타인 draft의 서명 첨부에 접근 불가", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const names = await visibleObjectNames();
      expect(names.some((n) => n.startsWith(s.issuedId))).toBe(true);
      expect(names.some((n) => n.startsWith(s.draftId))).toBe(false);
    });
  });

  test("view 계정: 리포트 작성·확정 RPC 거부(읽기 전용)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      await c.query("savepoint sp1");
      await expect(
        c.query("select public.upsert_service_report(null, $1::jsonb)", [
          JSON.stringify({ company_id: s.companyId, device_name: "X" }),
        ]),
      ).rejects.toThrow(/권한/);
      await c.query("rollback to savepoint sp1");
      await c.query("savepoint sp2");
      await expect(c.query("select public.issue_service_report($1)", [s.draftId])).rejects.toThrow(/권한/);
      await c.query("rollback to savepoint sp2");
    });
  });

  test("view 계정: PDF 상태 RPC 호출 가능(권한 검사 통과)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, VIEWER);
      const r = await c.query("select public.get_service_report_pdf_status($1) as st", [s.issuedId]);
      expect((r.rows[0].st as Record<string, unknown>).state).toBeDefined();
    });
  });

  test("view 계정: 리포트 메일 발송 상태(email_log) 조회 가능", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      await c.query(
        `insert into public.email_log (service_report_id, to_email, subject, status)
         values ($1,'a@b.test','제목','sent')`,
        [s.issuedId],
      );
      await asUser(c, VIEWER);
      const r = await c.query("select count(*)::int as n from public.email_log where service_report_id=$1", [
        s.issuedId,
      ]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});

describe("스토리지 홀 폐쇄 — 기사끼리도 타인 draft 첨부 차단", () => {
  test("기사 B는 기사 A의 draft 첨부를 못 본다(기존 홀)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, ENG_B);
      const names = await visibleObjectNames();
      expect(names.some((n) => n.startsWith(s.issuedId))).toBe(true);
      expect(names.some((n) => n.startsWith(s.draftId))).toBe(false);
    });
  });

  test("작성자 본인(기사 A)은 자기 draft 첨부를 본다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, ENG_A);
      const names = await visibleObjectNames();
      expect(names.some((n) => n.startsWith(s.draftId))).toBe(true);
    });
  });

  test("권한 없는 계정은 버킷 전체가 안 보인다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "vp-none@jhtech.test");
      await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      expect(await visibleObjectNames()).toHaveLength(0);
      expect(await visibleReportIds()).toHaveLength(0);
    });
  });
});

describe("기사의 보유장비 조회 — 현장 2단계 빈 목록 문제", () => {
  test("service_reports.write 계정이 담당 아닌 고객의 보유장비를 조회할 수 있다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id, label) values ($1,'보유장비A')", [
        s.companyId,
      ]);
      await asUser(c, ENG_A);
      const r = await c.query("select count(*)::int as n from public.company_equipment where company_id=$1", [
        s.companyId,
      ]);
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("기사는 보유장비를 수정·삭제하지 못한다(조회 전용)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const ce = await c.query(
        "insert into public.company_equipment (company_id, label) values ($1,'보유장비B') returning id",
        [s.companyId],
      );
      const id = ce.rows[0].id as string;
      await asUser(c, ENG_A);
      const upd = await c.query("update public.company_equipment set label='변조' where id=$1", [id]);
      expect(upd.rowCount).toBe(0); // 정책 미통과 → 0행
      const del = await c.query("delete from public.company_equipment where id=$1", [id]);
      expect(del.rowCount).toBe(0);
    });
  });

  test("view만 가진 영업은 보유장비를 못 본다(담당·전체조회 권한이 별도로 필요)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      await c.query("insert into public.company_equipment (company_id, label) values ($1,'보유장비C')", [
        s.companyId,
      ]);
      await asUser(c, VIEWER);
      const r = await c.query("select count(*)::int as n from public.company_equipment where company_id=$1", [
        s.companyId,
      ]);
      expect(r.rows[0].n).toBe(0);
    });
  });
});
