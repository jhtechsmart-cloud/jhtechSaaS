import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, FakeMailSender } from "@jhtechsaas/shared";
import { runOnce } from "./runner";

// 통합 테스트 — 로컬 Supabase(54321) + FakeMailSender. email 잡: CAS 멱등·재시도·영구실패·서명URL.
// 로컬 데모 service_role 키(비밀 아님). 로컬 Supabase가 떠 있어야 한다(db-tests와 동일 전제).
const URL = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const supabase = createServiceClient(URL, KEY);
const CO = "EMAIL_WORKER_E2E_견적사";

async function cleanup(): Promise<void> {
  const { data: apps } = await supabase.from("applications").select("id").eq("company", CO);
  for (const a of apps ?? []) {
    const { data: qs } = await supabase.from("quotes").select("id").eq("application_id", a.id as string);
    for (const q of qs ?? []) {
      await supabase.storage.from("quote-pdfs").remove([`${q.id as string}.pdf`]);
    }
  }
  await supabase.from("applications").delete().eq("company", CO); // cascade quotes
  await supabase.from("jobs").delete().eq("status", "queued");
}

// 발행본 + PDF 업로드 + pdf_url. 트리거가 만든 quote_pdf 잡은 제거(이 테스트는 email만).
async function seedIssuedQuoteWithPdf(): Promise<{ qid: string; appId: string }> {
  const { data: app } = await supabase
    .from("applications")
    .insert({ company: CO, email: "cust@x.com" })
    .select("id")
    .single();
  const appId = app!.id as string;
  const { data: quote } = await supabase
    .from("quotes")
    .insert({ application_id: appId, status: "issued" })
    .select("id")
    .single();
  const qid = quote!.id as string;
  await supabase.storage
    .from("quote-pdfs")
    .upload(`${qid}.pdf`, new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
      contentType: "application/pdf",
      upsert: true,
    });
  await supabase.from("quotes").update({ pdf_url: `${qid}.pdf` }).eq("id", qid); // 동결 트리거 예외
  // 트리거가 만든 quote_pdf 잡 제거 — 내 견적 것만(다른 통합 테스트 잡 보호).
  await supabase.from("jobs").delete().eq("type", "quote_pdf").eq("payload->>quote_id", qid);
  return { qid, appId };
}

async function enqueueEmail(qid: string, appId: string): Promise<string> {
  const { data: log } = await supabase
    .from("email_log")
    .insert({ application_id: appId, quote_id: qid, to_email: "cust@x.com", status: "pending" })
    .select("id")
    .single();
  const logId = log!.id as string;
  await supabase.from("jobs").insert({
    type: "email",
    payload: {
      email_log_id: logId,
      quote_id: qid,
      hiworks_user_id: "hong",
      to: "cust@x.com",
      cc: null,
      bcc: null,
      subject: "견적서",
      body: "본문입니다",
    },
  });
  return logId;
}

async function logStatus(logId: string): Promise<string> {
  const { data } = await supabase.from("email_log").select("status").eq("id", logId).single();
  return data!.status as string;
}

describe("email 워커 파이프라인(통합)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  test("정상 발송 → email_log sent + 발송기 1회 호출 + 본문에 서명URL·사용자 본문", async () => {
    const { qid, appId } = await seedIssuedQuoteWithPdf();
    const logId = await enqueueEmail(qid, appId);
    const fake = new FakeMailSender();

    await runOnce(supabase, { mailSender: fake });

    expect(await logStatus(logId)).toBe("sent");
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].fromUserId).toBe("hong");
    expect(fake.sent[0].to).toBe("cust@x.com");
    expect(fake.sent[0].html).toContain("본문입니다");
    expect(fake.sent[0].html).toContain("/storage/"); // 서명URL(로컬 스토리지 경로 포함)
  });

  test("멱등: 이미 sent인 로그로 다시 잡이 와도 재발송 안 함(CAS 스킵)", async () => {
    const { qid, appId } = await seedIssuedQuoteWithPdf();
    const logId = await enqueueEmail(qid, appId);
    await runOnce(supabase, { mailSender: new FakeMailSender() }); // 1차 발송 → sent
    expect(await logStatus(logId)).toBe("sent");

    // 같은 로그로 잡 한 건 더(스테일 회수/중복 클릭 모사)
    await supabase.from("jobs").insert({
      type: "email",
      payload: { email_log_id: logId, quote_id: qid, hiworks_user_id: "hong", to: "cust@x.com", subject: "x", body: "y" },
    });
    const fake2 = new FakeMailSender();
    await runOnce(supabase, { mailSender: fake2 });
    expect(fake2.sent).toHaveLength(0); // 재발송 안 함
    expect(await logStatus(logId)).toBe("sent");
  });

  test("일시 실패 → 락 해제(pending 복귀) + 잡 재큐, 다음 시도에 발송 성공", async () => {
    const { qid, appId } = await seedIssuedQuoteWithPdf();
    const logId = await enqueueEmail(qid, appId);
    const fake = new FakeMailSender();
    fake.failNext = true; // 1회 일시 실패(permanent=false)

    await runOnce(supabase, { mailSender: fake }); // 실패 → throw → failJob 재큐
    expect(await logStatus(logId)).toBe("pending"); // sending에 고착 안 됨
    expect(fake.sent).toHaveLength(0);

    await runOnce(supabase, { mailSender: fake }); // 재큐된 잡 재처리(이번엔 성공)
    expect(await logStatus(logId)).toBe("sent");
    expect(fake.sent).toHaveLength(1);
  });

  test("영구 실패 → email_log failed + 잡 재큐 안 함(한도 낭비 방지)", async () => {
    const { qid, appId } = await seedIssuedQuoteWithPdf();
    const logId = await enqueueEmail(qid, appId);
    const fake = new FakeMailSender();
    fake.failNext = true;
    fake.failPermanent = true; // 4xx류 영구 실패 모사

    await runOnce(supabase, { mailSender: fake });
    expect(await logStatus(logId)).toBe("failed");

    // 잡이 재큐 안 됐는지 — 큐에 남은 email 잡 없음
    const { data: queued } = await supabase
      .from("jobs")
      .select("id")
      .eq("type", "email")
      .eq("status", "queued");
    expect(queued ?? []).toHaveLength(0);
  });
});
