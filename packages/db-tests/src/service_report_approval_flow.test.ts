// #285 ②③ — 전이 쌍별 동결 트리거·PDF 세대 enqueue·승인 알림 잡·자동 메일 제거 + RPC(issue/approve/complete/void/resolve).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient, UID } from "./helpers";
import { DIR, ENG, MGMT, bindClient, flag, seed, setPdf, toApproved, toCompleted, toIssued, unflag } from "./service_report_approval_fixture";

let c: Client;
beforeAll(async () => { c = await makeClient(); bindClient(c); });
afterAll(async () => { await c.end(); });

async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

describe("#285 전이·동결 트리거", () => {
  test("허용 전이 5경로 + pdf_revision 증가·pdf_url 리셋", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await toIssued(s.reportId);
      let r = await c.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "issued", pdf_revision: 1, pdf_url: null });
      await setPdf(s.reportId, 1); // 동일 상태 허용 컬럼
      await toApproved(s.reportId);
      r = await c.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "approved", pdf_revision: 2, pdf_url: null });
      await toCompleted(s.reportId);
      r = await c.query("select status, pdf_revision from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "completed", pdf_revision: 2 });
      // approved → voided 도 허용
      const s2 = await seed(); await toIssued(s2.reportId); await toApproved(s2.reportId);
      await asPostgres(c); await flag();
      await c.query("update public.service_reports set status='voided', void_reason='x', voided_by=$2 where id=$1", [s2.reportId, UID.admin]);
      r = await c.query("select status, voided_at from public.service_reports where id=$1", [s2.reportId]);
      expect(r.rows[0].status).toBe("voided"); expect(r.rows[0].voided_at).not.toBeNull();
    });
  });

  test("금지 전이: draft→approved, issued→completed, completed→voided", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await flag();
      await expectReject(
        () => c.query("update public.service_reports set status='approved', approved_at=now(), approved_by=$2 where id=$1", [s.reportId, DIR]),
        /허용되지 않는 상태 전환/,
      );
      await toIssued(s.reportId);
      await flag();
      await expectReject(
        () => c.query("update public.service_reports set status='completed', completed_at=now(), completed_by=$2, tax_invoice_status='not_required' where id=$1", [s.reportId, MGMT]),
        /허용되지 않는 상태 전환/,
      );
      await toApproved(s.reportId); await toCompleted(s.reportId);
      await asPostgres(c); await flag();
      await expectReject(
        () => c.query("update public.service_reports set status='voided', void_reason='x', voided_by=$2 where id=$1", [s.reportId, UID.admin]),
        /완료된 리포트는 무효화할 수 없습니다/,
      );
    });
  });

  test("플래그 없이 status 변경 거부 / approved 전이에 approved_by 없으면 거부 / completed 전이에 tax 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asPostgres(c); await unflag();
      await expectReject(() => c.query("update public.service_reports set status='approved' where id=$1", [s.reportId]), /전용 RPC/);
      await flag();
      await expectReject(() => c.query("update public.service_reports set status='approved', approved_at=now() where id=$1", [s.reportId]), /approved_by/);
      await toApproved(s.reportId); await setPdf(s.reportId, 2);
      await asPostgres(c); await flag();
      await expectReject(() => c.query("update public.service_reports set status='completed', completed_at=now(), completed_by=$2 where id=$1", [s.reportId, MGMT]), /세금계산서/);
    });
  });

  test("동결: issued/approved/completed 각각에서 본문·승인·세금 필드 사후 변경 거부, pdf_url·follow_resolved_*만 허용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId);
      // now()는 tx 안에서 상수라 approved_at=now()는 승인 후 no-op — 하루 전 값으로 변경을 강제
      const frozen = ["total=1", "diagnosis='x'", "approved_at=now() - interval '1 day'", "tax_invoice_status='invoiced'"];
      await asPostgres(c);
      for (const set of frozen) {
        await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      }
      // pdf_revision은 트리거가 old 값으로 되돌린다(앱이 세대를 조작할 수 없음 — 조용히 무시)
      await c.query("update public.service_reports set pdf_revision=9 where id=$1", [s.reportId]);
      const rev = await c.query("select pdf_revision from public.service_reports where id=$1", [s.reportId]);
      expect(rev.rows[0].pdf_revision).toBe(1);
      await c.query("update public.service_reports set follow_resolved_at=now(), follow_resolved_by=$2 where id=$1", [s.reportId, ENG]);
      await toApproved(s.reportId); await asPostgres(c);
      for (const set of frozen.concat(["approver_name='x'", "approved_by=null"])) {
        await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      }
      await toCompleted(s.reportId); await asPostgres(c);
      for (const set of frozen.concat(["completed_at=now() - interval '1 day'", "tax_invoice_memo='m'"])) {
        await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      }
      await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r2b.pdf`]);
    });
  });

  test("PDF 잡: issued 1건(revision 1·expected issued) → approved 시 queued 잡 payload가 세대 2·approved로 갱신(중복 없음)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      let j = await c.query("select payload from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      expect(j.rowCount).toBe(1);
      expect(j.rows[0].payload).toMatchObject({ revision: 1, expected_status: "issued" });
      await toApproved(s.reportId);
      j = await c.query("select payload, status from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      expect(j.rowCount).toBe(1);
      expect(j.rows[0].payload).toMatchObject({ revision: 2, expected_status: "approved" });
    });
  });

  test("PDF 잡: 기존 잡이 processing이면 새 queued 잡을 추가한다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await c.query("update public.jobs set status='processing' where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      await toApproved(s.reportId);
      const j = await c.query("select status from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1 order by created_at", [s.reportId]);
      expect(j.rows.map((r) => r.status)).toEqual(["processing", "queued"]);
    });
  });

  test("자동 고객 메일 트리거 제거: pdf_url 기록해도 email_log(customer) 0건", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await setPdf(s.reportId, 1);
      const e = await c.query("select count(*)::int n from public.email_log where service_report_id=$1 and kind='customer'", [s.reportId]);
      expect(e.rows[0].n).toBe(0);
      const trg = await c.query("select 1 from pg_trigger where tgname='service_reports_enqueue_email_trg'");
      expect(trg.rowCount).toBe(0);
    });
  });

  test("알림 잡: issued 시 initial(즉시)+reminder(run_after≈+3d) 2건, approved 시 queued 알림 삭제", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      const j = await c.query(
        "select payload->>'kind' kind, run_after from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1 order by created_at, run_after nulls first",
        [s.reportId],
      );
      expect(j.rows.map((r) => r.kind)).toEqual(["initial", "reminder"]);
      expect(j.rows[0].run_after).toBeNull();
      const days = (new Date(j.rows[1].run_after).getTime() - Date.now()) / 86400000;
      expect(days).toBeGreaterThan(2.9); expect(days).toBeLessThan(3.1);
      await toApproved(s.reportId);
      const left = await c.query(
        "select count(*)::int n from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1 and status='queued'",
        [s.reportId],
      );
      expect(left.rows[0].n).toBe(0);
    });
  });

  test("알림 잡: voided 전이도 queued 알림을 삭제한다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asPostgres(c); await flag();
      await c.query("update public.service_reports set status='voided', void_reason='x', voided_by=$2 where id=$1", [s.reportId, UID.admin]);
      const left = await c.query(
        "select count(*)::int n from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1 and status='queued'",
        [s.reportId],
      );
      expect(left.rows[0].n).toBe(0);
    });
  });
});
