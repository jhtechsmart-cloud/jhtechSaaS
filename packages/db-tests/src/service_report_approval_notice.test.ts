// #285 ③ — 수동 고객 메일(enqueue_service_report_email)·KPI(service_report_kpis)·알림 이력 조회 RPC.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const ENG = "00000000-0000-0000-0000-0000000000d1";
const DIR = "00000000-0000-0000-0000-0000000000d2";
const MGMT = "00000000-0000-0000-0000-0000000000d3";
const VIEW = "00000000-0000-0000-0000-0000000000d4";
const STAMP = `${DIR}/stamp-1757400000.png`;

async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}
const flag = () => c.query("select set_config('app.service_reports_status_change','1',true)");

let seq = 0;
async function seedUsers(): Promise<void> {
  const exists = await c.query("select 1 from auth.users where id=$1", [ENG]);
  if (exists.rowCount) return;
  await seedAuthUser(c, UID.admin, "no-admin@jhtech.test");
  await seedAuthUser(c, ENG, "no-eng@jhtech.test");
  await seedAuthUser(c, DIR, "no-dir@jhtech.test");
  await seedAuthUser(c, MGMT, "no-mgmt@jhtech.test");
  await seedAuthUser(c, VIEW, "no-view@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{service_reports.write}', name='홍기사', hiworks_user_id='eng' where id=$1", [ENG]);
  await c.query("update public.profiles set permissions='{service_reports.approve}', name='배이사', position='영업부 이사', hiworks_user_id='dir', approval_stamp_path=$2 where id=$1", [DIR, STAMP]);
  await c.query("update public.profiles set permissions='{service_reports.complete,email.send}', hiworks_user_id='mgmt' where id=$1", [MGMT]);
  await c.query("update public.profiles set permissions='{service_reports.view}' where id=$1", [VIEW]);
}

async function seed(opts: { follow?: boolean } = {}): Promise<{ requestId: string; reportId: string }> {
  await asPostgres(c);
  await seedUsers();
  seq += 1;
  const biz = String(6000000000 + seq);
  const co = await c.query("insert into public.companies (name, biz_no, email) values ('알림상사', $1, 'cust@jhtech.test') returning id", [biz]);
  const rq = await c.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,'알림상사','received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, co.rows[0].id],
  );
  const rp = await c.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
        charge_type, visit_fee, follow_needed, recipient_email, created_by)
     values ($1,$2,'알림상사','JU-2513UV','{접촉불량}','진단','조치','paid',10000,$3,'cust@jhtech.test',$4) returning id`,
    [rq.rows[0].id, co.rows[0].id, opts.follow ?? false, ENG],
  );
  return { requestId: rq.rows[0].id as string, reportId: rp.rows[0].id as string };
}
async function toIssued(id: string): Promise<void> {
  await asPostgres(c); await flag();
  await c.query("update public.service_reports set status='issued', issued_at=now() where id=$1", [id]);
}
async function setPdf(id: string, rev: number): Promise<void> {
  await asPostgres(c);
  await c.query("update public.service_reports set pdf_url=$2 where id=$1", [id, `${id}/report-r${rev}.pdf`]);
}
async function toApproved(id: string): Promise<void> {
  await asPostgres(c); await flag();
  await c.query(
    "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_title='영업부 이사', approver_stamp_path=$3 where id=$1",
    [id, DIR, STAMP],
  );
}

describe("#285 수동 고객 메일·KPI·알림 조회", () => {
  test("enqueue_service_report_email: issued 거부 → approved 허용(발신자=호출자 hiworks) → 중복 거부 → sent 후 재발송 → 호출자 hiworks 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await setPdf(s.reportId, 1);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /승인된 리포트만/);
      await toApproved(s.reportId);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /PDF/);
      await setPdf(s.reportId, 2);
      await asUser(c, VIEW);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /권한/);
      await asUser(c, MGMT);
      const r = await c.query("select public.enqueue_service_report_email($1) as r", [s.reportId]);
      expect(r.rows[0].r.status).toBe("pending");
      await asPostgres(c);
      const log = await c.query("select from_user_id, kind, to_email, status from public.email_log where service_report_id=$1", [s.reportId]);
      expect(log.rows[0]).toMatchObject({ from_user_id: MGMT, kind: "customer", to_email: "cust@jhtech.test", status: "pending" });
      const job = await c.query("select payload from public.jobs where type='service_report_email' and payload->>'service_report_id'=$1", [s.reportId]);
      expect(job.rowCount).toBe(1);
      expect(job.rows[0].payload.hiworks_user_id).toBe("mgmt");
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /이미 발송 대기 중/);
      await asPostgres(c); await c.query("update public.email_log set status='sent' where service_report_id=$1", [s.reportId]);
      await asUser(c, MGMT);
      await c.query("select public.enqueue_service_report_email($1)", [s.reportId]); // 재발송 OK
      await asPostgres(c);
      await c.query("update public.email_log set status='sent' where service_report_id=$1", [s.reportId]);
      await c.query("update public.profiles set hiworks_user_id=null where id=$1", [MGMT]);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /하이웍스/);
    });
  });

  test("enqueue_service_report_email: 수신 이메일 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await setPdf(s.reportId, 1); await toApproved(s.reportId); await setPdf(s.reportId, 2);
      await asPostgres(c);
      // recipient_email은 동결 컬럼이라 트리거를 우회해 픽스처만 조정(테스트 전용)
      await c.query("alter table public.service_reports disable trigger service_reports_bu");
      await c.query("update public.service_reports set recipient_email=null where id=$1", [s.reportId]);
      await c.query("alter table public.service_reports enable trigger service_reports_bu");
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /수신 이메일/);
    });
  });

  test("service_report_kpis: 5키 정수, 권한 무관 동일, 권한 없으면 예외", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId);
      const s2 = await seed(); await toIssued(s2.reportId); await toApproved(s2.reportId);
      await asUser(c, VIEW);
      const a = await c.query("select public.service_report_kpis() as k");
      await asUser(c, DIR);
      const b = await c.query("select public.service_report_kpis() as k");
      expect(a.rows[0].k).toEqual(b.rows[0].k);
      const k = a.rows[0].k;
      for (const key of ["received", "follow_open", "awaiting_approval", "awaiting_tax", "completed_this_month"]) {
        expect(typeof k[key]).toBe("number");
      }
      expect(k.awaiting_approval).toBeGreaterThanOrEqual(1);
      expect(k.awaiting_tax).toBeGreaterThanOrEqual(1);
      expect(k.follow_open).toBeGreaterThanOrEqual(1);
      expect(k.received).toBeGreaterThanOrEqual(2);
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{}' where id=$1", [VIEW]);
      await asUser(c, VIEW);
      await expectReject(() => c.query("select public.service_report_kpis()"), /권한/);
    });
  });

  test("get_service_report_approval_notice: 접근 가능 행만 {sent_count,last_sent_at}", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asPostgres(c);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind, sent_at) values ($1,'dir@x.y','sent','approval_notice',now())", [s.reportId]);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'dir2@x.y','failed','approval_notice')", [s.reportId]);
      await asUser(c, VIEW);
      const r = await c.query("select public.get_service_report_approval_notice($1) as r", [s.reportId]);
      expect(r.rows[0].r.sent_count).toBe(1);
      expect(r.rows[0].r.last_sent_at).not.toBeNull();
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{}' where id=$1", [VIEW]);
      await asUser(c, VIEW);
      await expectReject(() => c.query("select public.get_service_report_approval_notice($1)", [s.reportId]), /권한/);
    });
  });
});
