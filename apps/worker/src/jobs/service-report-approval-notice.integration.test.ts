import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { FakeMailSender } from "@jhtechsaas/shared";
import { ServiceReportSeed } from "./_service-report-test-seed";
import { processApprovalNoticeJob, type ApprovalNoticeOpts } from "./service-report-approval-notice";

// 통합 테스트 — 로컬 Supabase + FakeMailSender. 승인 요청 알림 잡(#285 A-1):
// 수신자 = 활성 + service_reports.approve 보유자(관리자·비활성 제외) · issued가 아니면 스킵 · 수신자 0 = 실패 표면화 ·
// 발신자 폴백 · 재시도 시 이미 받은 수신자 제외.
const seed = new ServiceReportSeed("NOTICE_WORKER_E2E_알림상사", 7000000000);
const { supabase } = seed;
const EMAILS = {
  eng: "notice-eng@jhtech.test",
  dir: "notice-dir@jhtech.test", // 승인자(활성)
  dirOff: "notice-dir-off@jhtech.test", // 승인자(비활성) → 제외
  admin: "notice-admin@jhtech.test", // users.manage만 → 제외
  dirA: "notice-dir-a@jhtech.test", // 부분 실패 테스트용 두 번째 승인자(테스트 안에서만 활성)
} as const;
let ENG = "";
let DIR = "";
const OPTS: ApprovalNoticeOpts = { adminBaseUrl: "https://admin.example.test" };

async function noticeLogs(id: string): Promise<{ to_email: string; status: string; subject: string | null }[]> {
  const r = await seed.pg.query(
    "select to_email, status, subject from public.email_log where service_report_id=$1 and kind='approval_notice' order by to_email",
    [id],
  );
  return r.rows as { to_email: string; status: string; subject: string | null }[];
}
const run = (id: string, kind: "initial" | "reminder", mail: FakeMailSender, opts = OPTS) =>
  processApprovalNoticeJob(supabase, { service_report_id: id, kind, revision: 1 }, mail, opts);

describe("service_report_approval_notice 잡(통합)", () => {
  beforeAll(async () => {
    await seed.connect();
    await seed.purgeUsers(Object.values(EMAILS));
    await seed.cleanup();
    ENG = await seed.createUser(EMAILS.eng);
    DIR = await seed.createUser(EMAILS.dir);
    const DIR_OFF = await seed.createUser(EMAILS.dirOff);
    const ADMIN = await seed.createUser(EMAILS.admin);
    await seed.pg.query("update public.profiles set permissions='{service_reports.write}', name='홍기사', hiworks_user_id='eng' where id=$1", [ENG]);
    await seed.pg.query("update public.profiles set permissions='{service_reports.approve}', name='배이사' where id=$1", [DIR]);
    await seed.pg.query("update public.profiles set permissions='{service_reports.approve}', is_active=false where id=$1", [DIR_OFF]);
    await seed.pg.query("update public.profiles set permissions='{users.manage}' where id=$1", [ADMIN]);
  });
  afterAll(async () => {
    await seed.cleanup();
    await seed.end();
  });
  let mail: FakeMailSender;
  beforeEach(() => {
    mail = new FakeMailSender();
  });

  test("initial: 활성 승인자에게만 1통(관리자·비활성 제외), 기사 명의, 링크는 행 id, email_log kind=approval_notice sent", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await run(id, "initial", mail);
    expect(mail.sent.map((m) => m.to)).toEqual([EMAILS.dir]);
    expect(mail.sent[0]!.fromUserId).toBe("eng");
    expect(mail.sent[0]!.subject).toMatch(/^\[승인 요청\] SR-/);
    expect(mail.sent[0]!.html).toContain(`https://admin.example.test/admin/service-reports/${id}`);
    expect(await noticeLogs(id)).toEqual([{ to_email: EMAILS.dir, status: "sent", subject: expect.stringMatching(/^\[승인 요청\]/) }]);
  });

  test("reminder: 아직 issued면 [재알림] 제목으로 발송", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await run(id, "reminder", mail);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toMatch(/^\[재알림\]/);
  });

  test("reminder: 이미 approved면 발송 없이 성공 종료(email_log 0)", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await seed.approve(id, DIR, `${DIR}/stamp-1.png`);
    await run(id, "reminder", mail);
    expect(mail.sent).toHaveLength(0);
    expect(await noticeLogs(id)).toHaveLength(0);
  });

  test("reminder: 무효화(voided)됐으면 발송 없이 성공 종료", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await seed.void(id, DIR);
    await run(id, "reminder", mail);
    expect(mail.sent).toHaveLength(0);
  });

  test("발신자 하이웍스 ID 없음: 폴백 없으면 throw(재시도→failed), 폴백 있으면 그 명의로 발송", async () => {
    const id = await seed.seedIssued({ createdBy: ENG, senderHiworks: null });
    await expect(run(id, "initial", mail)).rejects.toThrow(/발신자/);
    expect(mail.sent).toHaveLength(0);
    await run(id, "initial", mail, { ...OPTS, fallbackSenderId: "noreply" });
    expect(mail.sent[0]!.fromUserId).toBe("noreply");
  });

  test("수신자 0명(승인 권한자 전원 비활성): throw로 표면화(3회 후 잡 failed → 타임라인 '알림 실패')", async () => {
    await seed.pg.query("update public.profiles set is_active=false where id=$1", [DIR]);
    try {
      const id = await seed.seedIssued({ createdBy: ENG });
      await expect(run(id, "initial", mail)).rejects.toThrow(/승인 권한자/);
      expect(mail.sent).toHaveLength(0);
    } finally {
      await seed.pg.query("update public.profiles set is_active=true where id=$1", [DIR]);
    }
  });

  test("일시 실패(5xx 상당)면 email_log failed 기록 후 throw — 공용 재시도 규칙(at-least-once)", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    mail.failNext = true;
    await expect(run(id, "initial", mail)).rejects.toThrow(/일시 실패 1건/);
    expect((await noticeLogs(id)).map((l) => l.status)).toEqual(["failed"]);
  });

  test("영구 실패(4xx 상당)면 email_log failed 기록, throw 없음(재시도해도 같은 결과)", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    mail.failNext = true;
    mail.failPermanent = true;
    await expect(run(id, "initial", mail)).resolves.toBeUndefined();
    expect((await noticeLogs(id)).map((l) => l.status)).toEqual(["failed"]);
  });

  test("승인자 2명 중 1명 일시 실패: 성공한 1명은 sent, 재시도에서는 실패한 1명에게만 다시 보낸다", async () => {
    const dirA = await seed.createUser(EMAILS.dirA);
    await seed.pg.query("update public.profiles set permissions='{service_reports.approve}', name='가이사' where id=$1", [dirA]);
    try {
      const id = await seed.seedIssued({ createdBy: ENG });
      mail.failNext = true; // 정렬상 첫 수신자(dir-a)만 실패
      await expect(run(id, "initial", mail)).rejects.toThrow(/일시 실패 1건/);
      expect(mail.sent.map((m) => m.to)).toEqual([EMAILS.dir]);

      const retry = new FakeMailSender();
      await run(id, "initial", retry);
      expect(retry.sent.map((m) => m.to)).toEqual([EMAILS.dirA]);
      const sent = (await noticeLogs(id)).filter((l) => l.status === "sent").map((l) => l.to_email);
      expect(sent).toEqual([EMAILS.dirA, EMAILS.dir]);
    } finally {
      await seed.pg.query("update public.profiles set is_active=false where id=$1", [dirA]);
    }
  });
});
