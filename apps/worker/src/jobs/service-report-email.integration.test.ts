import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { FakeMailSender } from "@jhtechsaas/shared";
import { PNG, ServiceReportSeed } from "./_service-report-test-seed";
import { processServiceReportEmailJob } from "./service-report-email";
import { MAX_ATTEMPTS } from "./queue";

// 통합 테스트 — 고객 메일 잡(#285): 승인본만 발송·발신자 = payload(RPC가 실은 호출자 명의)·상태기계 종단.
const seed = new ServiceReportSeed("MAIL_WORKER_E2E_발송상사", 9000000000);
const { supabase } = seed;
const EMAILS = ["mail-eng@jhtech.test"];
let ENG = "";

async function insertLog(id: string): Promise<string> {
  const r = await seed.pg.query(
    "insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'cust@jhtech.test','pending','customer') returning id",
    [id],
  );
  return r.rows[0].id as string;
}
async function logRow(logId: string): Promise<{ status: string; error_msg: string | null }> {
  const r = await seed.pg.query("select status, error_msg from public.email_log where id=$1", [logId]);
  return r.rows[0] as { status: string; error_msg: string | null };
}
// 승인본 + PDF 파일 + pdf_url(워커 경로) 준비.
async function seedApprovedWithPdf(): Promise<string> {
  const id = await seed.seedIssued({ createdBy: ENG });
  await seed.approve(id, ENG, `${ENG}/stamp-1.png`);
  await supabase.storage.from("service-reports").upload(`${id}/report-r2.pdf`, PNG, { contentType: "application/pdf" });
  await seed.setPdfUrl(id, `${id}/report-r2.pdf`);
  return id;
}
const run = (logId: string, id: string, mail: FakeMailSender, payload: Record<string, unknown> = { hiworks_user_id: "mgmt" }, attempts = 1) =>
  processServiceReportEmailJob(supabase, { email_log_id: logId, service_report_id: id, ...payload }, mail, attempts);

describe("service_report_email 잡(통합)", () => {
  beforeAll(async () => {
    await seed.connect();
    await seed.purgeUsers(EMAILS);
    await seed.cleanup();
    ENG = await seed.createUser(EMAILS[0]!);
  });
  afterAll(async () => {
    await seed.cleanup();
    await seed.end();
  });
  let mail: FakeMailSender;
  beforeEach(() => {
    mail = new FakeMailSender();
  });

  test("approved + pdf_url: payload 하이웍스 ID(버튼 누른 사람) 명의로 발송, sent 종단, 7일 서명 URL 포함", async () => {
    const id = await seedApprovedWithPdf();
    const logId = await insertLog(id);
    await run(logId, id, mail);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.fromUserId).toBe("mgmt");
    expect(mail.sent[0]!.to).toBe("cust@jhtech.test");
    expect(mail.sent[0]!.html).toContain(`${id}/report-r2.pdf`);
    expect((await logRow(logId)).status).toBe("sent");
  });

  test("issued(미승인)면 발송 없이 email_log failed 종단", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await supabase.storage.from("service-reports").upload(`${id}/report-r1.pdf`, PNG, { contentType: "application/pdf" });
    await seed.setPdfUrl(id, `${id}/report-r1.pdf`);
    const logId = await insertLog(id);
    await run(logId, id, mail);
    expect(mail.sent).toHaveLength(0);
    expect(await logRow(logId)).toMatchObject({ status: "failed", error_msg: expect.stringContaining("issued") });
  });

  test("payload에 발신자 없음(구 잡): 기사 스냅샷으로 폴백하지 않고 failed 종단(마지막 시도)", async () => {
    const id = await seedApprovedWithPdf();
    const logId = await insertLog(id);
    await expect(run(logId, id, mail, {}, MAX_ATTEMPTS)).rejects.toThrow(/발신자/);
    expect(mail.sent).toHaveLength(0);
    expect((await logRow(logId)).status).toBe("failed");
  });

  test("일시 실패: pending 복귀 + throw(재시도), 마지막 시도면 failed 종단", async () => {
    const id = await seedApprovedWithPdf();
    const logId = await insertLog(id);
    mail.failNext = true;
    await expect(run(logId, id, mail, undefined, 1)).rejects.toThrow();
    expect((await logRow(logId)).status).toBe("pending");
    mail.failNext = true;
    await expect(run(logId, id, mail, undefined, MAX_ATTEMPTS)).rejects.toThrow();
    expect((await logRow(logId)).status).toBe("failed");
  });

  test("영구 실패: failed 종단, throw 없음 / 이미 처리된 로그(CAS 0행)는 스킵", async () => {
    const id = await seedApprovedWithPdf();
    const logId = await insertLog(id);
    mail.failNext = true;
    mail.failPermanent = true;
    await expect(run(logId, id, mail)).resolves.toBeUndefined();
    expect((await logRow(logId)).status).toBe("failed");
    await run(logId, id, mail); // failed 상태 → pending 락 실패 → 스킵
    expect(mail.sent).toHaveLength(0);
  });
});
