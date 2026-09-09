import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Client } from "pg";
import { createServiceClient, FakeMailSender } from "@jhtechsaas/shared";
import { processApprovalNoticeJob } from "./service-report-approval-notice";

// 통합 테스트 — 로컬 Supabase(54321/54322) + FakeMailSender. 승인 요청 알림 잡(#285 A-1):
// 수신자 = 활성 + service_reports.approve 보유자(관리자·비활성 제외) · issued가 아니면 스킵 · 수신자 0 성공 ·
// 발신자 폴백. 상태 전이는 tx-local 플래그가 필요해 REST로 못 만들므로 pg로 직접 시드(db-tests와 동일 전제).
const URL = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const supabase = createServiceClient(URL, KEY);
const pg = new Client({ connectionString: DB_URL });

// 사용자는 auth admin API로 생성(GoTrue가 읽을 수 있는 완전한 행 — pg 직접 insert는 getUserById가 못 찾는다).
const EMAILS = {
  eng: "notice-eng@jhtech.test",
  dir: "notice-dir@jhtech.test", // 승인자(활성)
  dirOff: "notice-dir-off@jhtech.test", // 승인자(비활성) → 제외
  admin: "notice-admin@jhtech.test", // users.manage만 → 제외
} as const;
let ENG = "";
let DIR = "";
const CO = "NOTICE_WORKER_E2E_알림상사";
const OPTS = { adminBaseUrl: "https://admin.example.test" };

async function cleanup(): Promise<void> {
  await pg.query("delete from public.email_log where kind='approval_notice' and service_report_id in (select id from public.service_reports where customer_name=$1)", [CO]);
  await pg.query("delete from public.jobs where type='service_report_approval_notice'");
  await pg.query("delete from public.service_reports where customer_name=$1", [CO]);
  await pg.query("delete from public.service_requests where contact_company=$1", [CO]);
  await pg.query("delete from public.companies where name=$1", [CO]);
  await pg.query("delete from auth.users where email = any($1::text[])", [Object.values(EMAILS)]);
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({ email, password: "notice-test-pw-1234", email_confirm: true });
  if (error || !data.user) throw new Error(`테스트 사용자 생성 실패(${email}): ${error?.message}`);
  return data.user.id;
}

async function seedUsers(): Promise<void> {
  ENG = await createUser(EMAILS.eng);
  DIR = await createUser(EMAILS.dir);
  const DIR_OFF = await createUser(EMAILS.dirOff);
  const ADMIN = await createUser(EMAILS.admin);
  await pg.query("update public.profiles set permissions='{service_reports.write}', name='홍기사', hiworks_user_id='eng' where id=$1", [ENG]);
  await pg.query("update public.profiles set permissions='{service_reports.approve}', name='배이사' where id=$1", [DIR]);
  await pg.query("update public.profiles set permissions='{service_reports.approve}', is_active=false where id=$1", [DIR_OFF]);
  await pg.query("update public.profiles set permissions='{users.manage}' where id=$1", [ADMIN]);
}

let seq = 0;
// issued 리포트 1건(기사 하이웍스 스냅샷은 인자로). 트리거가 만든 알림 잡은 지운다(본 테스트는 process 직접 호출).
async function seedIssued(opts: { senderHiworks?: string | null; status?: "issued" | "approved" } = {}): Promise<string> {
  seq += 1;
  const biz = String(7000000000 + seq);
  const co = await pg.query("insert into public.companies (name, biz_no, email) values ($1,$2,'cust@jhtech.test') returning id", [CO, biz]);
  const rq = await pg.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,$3,'received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, co.rows[0].id, CO],
  );
  const rp = await pg.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
        charge_type, visit_fee, follow_needed, recipient_email, created_by)
     values ($1,$2,$3,'JU-2513UV','{접촉불량}','진단','조치','paid',10000,false,'cust@jhtech.test',$4) returning id`,
    [rq.rows[0].id, co.rows[0].id, CO, ENG],
  );
  const id = rp.rows[0].id as string;
  await pg.query("begin");
  await pg.query("select set_config('app.service_reports_status_change','1',true)");
  await pg.query(
    "update public.service_reports set status='issued', issued_at=now(), engineer_name='홍기사', sender_hiworks_user_id=$2 where id=$1",
    [id, opts.senderHiworks === undefined ? "eng" : opts.senderHiworks],
  );
  if (opts.status === "approved") {
    await pg.query(
      "update public.service_reports set pdf_url = id::text || '/report-r1.pdf' where id=$1",
      [id],
    );
    await pg.query(
      "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_stamp_path=$3 where id=$1",
      [id, DIR, `${DIR}/stamp-1.png`],
    );
  }
  await pg.query("commit");
  await pg.query("delete from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1", [id]);
  return id;
}

async function noticeLogs(id: string): Promise<{ to_email: string; status: string; subject: string | null }[]> {
  const r = await pg.query("select to_email, status, subject from public.email_log where service_report_id=$1 and kind='approval_notice' order by to_email", [id]);
  return r.rows as { to_email: string; status: string; subject: string | null }[];
}

describe("service_report_approval_notice 잡(통합)", () => {
  beforeAll(async () => {
    await pg.connect();
    await cleanup();
    await seedUsers();
  });
  afterAll(async () => {
    await cleanup();
    await pg.end();
  });
  let mail: FakeMailSender;
  beforeEach(() => {
    mail = new FakeMailSender();
  });

  test("initial: 활성 승인자에게만 1통(관리자·비활성 제외), 기사 명의, email_log kind=approval_notice sent", async () => {
    const id = await seedIssued();
    await processApprovalNoticeJob(supabase, { service_report_id: id, kind: "initial", revision: 1 }, mail, OPTS);
    expect(mail.sent.map((m) => m.to)).toEqual(["notice-dir@jhtech.test"]);
    expect(mail.sent[0]!.fromUserId).toBe("eng");
    expect(mail.sent[0]!.subject).toMatch(/^\[승인 요청\] SR-/);
    expect(mail.sent[0]!.html).toContain(`https://admin.example.test/admin/service-reports/${id}`);
    const logs = await noticeLogs(id);
    expect(logs).toEqual([{ to_email: "notice-dir@jhtech.test", status: "sent", subject: expect.stringMatching(/^\[승인 요청\]/) }]);
  });

  test("reminder: 아직 issued면 [재알림] 제목으로 발송", async () => {
    const id = await seedIssued();
    await processApprovalNoticeJob(supabase, { service_report_id: id, kind: "reminder", revision: 1 }, mail, OPTS);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toMatch(/^\[재알림\]/);
  });

  test("reminder: 이미 approved면 발송 없이 성공 종료(email_log 0)", async () => {
    const id = await seedIssued({ status: "approved" });
    await processApprovalNoticeJob(supabase, { service_report_id: id, kind: "reminder", revision: 2 }, mail, OPTS);
    expect(mail.sent).toHaveLength(0);
    expect(await noticeLogs(id)).toHaveLength(0);
  });

  test("발신자 하이웍스 ID 없음: 폴백 없으면 throw(재시도→failed), 폴백 있으면 그 명의로 발송", async () => {
    const id = await seedIssued({ senderHiworks: null });
    await expect(processApprovalNoticeJob(supabase, { service_report_id: id, kind: "initial" }, mail, OPTS)).rejects.toThrow(/발신자/);
    expect(mail.sent).toHaveLength(0);
    await processApprovalNoticeJob(supabase, { service_report_id: id, kind: "initial" }, mail, { ...OPTS, fallbackSenderId: "noreply" });
    expect(mail.sent[0]!.fromUserId).toBe("noreply");
  });

  test("수신자 0명: 발송 없이 성공 종료(경고 로그)", async () => {
    await pg.query("update public.profiles set is_active=false where id=$1", [DIR]);
    try {
      const id = await seedIssued();
      await processApprovalNoticeJob(supabase, { service_report_id: id, kind: "initial" }, mail, OPTS);
      expect(mail.sent).toHaveLength(0);
    } finally {
      await pg.query("update public.profiles set is_active=true where id=$1", [DIR]);
    }
  });

  test("일시 실패(5xx 상당)면 email_log failed 기록 후 throw — 공용 재시도 규칙(at-least-once)", async () => {
    const id = await seedIssued();
    mail.failNext = true;
    await expect(processApprovalNoticeJob(supabase, { service_report_id: id, kind: "initial" }, mail, OPTS)).rejects.toThrow();
    const logs = await noticeLogs(id);
    expect(logs.map((l) => l.status)).toEqual(["failed"]);
  });
});
