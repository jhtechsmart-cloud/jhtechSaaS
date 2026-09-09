import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { Client } from "pg";
import { createServiceClient } from "@jhtechsaas/shared";

// 통합 테스트 — 로컬 Supabase + 크롬 없이(렌더 스텁) PDF 잡의 세대 가드·직인 복사·불변 경로·CAS 기록(#285 D-C8).
// 상태 전이는 tx-local 플래그가 필요해 pg로 직접 시드.
vi.mock("./render-service-report-pdf", () => ({
  buildServiceReportPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));
vi.mock("./assets", () => ({ getFontDataUri: vi.fn(async () => "data:font/otf;base64,FONT") }));

import { buildServiceReportPdf } from "./render-service-report-pdf";
import { processServiceReportPdfJob } from "./service-report-pdf";

const URL = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const supabase = createServiceClient(URL, KEY);
const pg = new Client({ connectionString: DB_URL });
const CO = "PDF_WORKER_E2E_결재상사";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
let ENG = "";
let DIR = "";
let STAMP = "";

async function cleanup(): Promise<void> {
  const ids = (await pg.query("select id from public.service_reports where customer_name=$1", [CO])).rows.map((r) => r.id as string);
  for (const id of ids) {
    const { data } = await supabase.storage.from("service-reports").list(id);
    if (data?.length) await supabase.storage.from("service-reports").remove(data.map((o) => `${id}/${o.name}`));
  }
  if (STAMP) await supabase.storage.from("approval-stamps").remove([STAMP]);
  await pg.query("delete from public.jobs where type in ('service_report_pdf','service_report_approval_notice')");
  await pg.query("delete from public.service_reports where customer_name=$1", [CO]);
  await pg.query("delete from public.service_requests where contact_company=$1", [CO]);
  await pg.query("delete from public.companies where name=$1", [CO]);
  await pg.query("delete from auth.users where email in ('pdf-eng@jhtech.test','pdf-dir@jhtech.test')");
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({ email, password: "pdf-test-pw-1234", email_confirm: true });
  if (error || !data.user) throw new Error(`사용자 생성 실패: ${error?.message}`);
  return data.user.id;
}

let seq = 0;
// 고객·기사 서명이 실제 스토리지에 있는 issued 리포트(pdf_revision=1). 트리거가 만든 잡은 제거(직접 호출).
async function seedIssued(opts: { engineerSig?: boolean } = {}): Promise<string> {
  seq += 1;
  const biz = String(8000000000 + seq);
  const co = await pg.query("insert into public.companies (name, biz_no) values ($1,$2) returning id", [CO, biz]);
  const rq = await pg.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,$3,'received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, co.rows[0].id, CO],
  );
  const rp = await pg.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
        charge_type, visit_fee, follow_needed, created_by)
     values ($1,$2,$3,'JU-2513UV','{접촉불량}','진단','조치','paid',10000,false,$4) returning id`,
    [rq.rows[0].id, co.rows[0].id, CO, ENG],
  );
  const id = rp.rows[0].id as string;
  await supabase.storage.from("service-reports").upload(`${id}/signature.png`, PNG, { contentType: "image/png" });
  const engSig = opts.engineerSig ?? true;
  if (engSig) await supabase.storage.from("service-reports").upload(`${id}/engineer-signature.png`, PNG, { contentType: "image/png" });
  await pg.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [
    id, `${id}/signature.png`, engSig ? `${id}/engineer-signature.png` : null,
  ]);
  await pg.query("begin");
  await pg.query("select set_config('app.service_reports_status_change','1',true)");
  await pg.query("update public.service_reports set status='issued', issued_at=now(), engineer_name='홍기사' where id=$1", [id]);
  await pg.query("commit");
  await pg.query("delete from public.jobs where payload->>'service_report_id'=$1", [id]);
  return id;
}

async function approve(id: string): Promise<void> {
  await pg.query("begin");
  await pg.query("select set_config('app.service_reports_status_change','1',true)");
  await pg.query(
    "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_title='영업부 이사', approver_stamp_path=$3 where id=$1",
    [id, DIR, STAMP],
  );
  await pg.query("commit");
  await pg.query("delete from public.jobs where payload->>'service_report_id'=$1", [id]);
}

async function row(id: string): Promise<{ status: string; pdf_revision: number; pdf_url: string | null }> {
  const r = await pg.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [id]);
  return r.rows[0] as { status: string; pdf_revision: number; pdf_url: string | null };
}
async function exists(path: string): Promise<boolean> {
  const { data } = await supabase.storage.from("service-reports").download(path);
  return !!data;
}
const lastRender = () => vi.mocked(buildServiceReportPdf).mock.calls.at(-1)?.[0];

describe("service_report_pdf 잡(통합) — 세대 가드·직인·CAS", () => {
  beforeAll(async () => {
    await pg.connect();
    await cleanup();
    ENG = await createUser("pdf-eng@jhtech.test");
    DIR = await createUser("pdf-dir@jhtech.test");
    STAMP = `${DIR}/stamp-1757400000.png`;
    await pg.query("update public.profiles set name='홍기사' where id=$1", [ENG]);
    await pg.query("update public.profiles set name='배이사', position='영업부 이사', approval_stamp_path=$2 where id=$1", [DIR, STAMP]);
    const up = await supabase.storage.from("approval-stamps").upload(STAMP, PNG, { contentType: "image/png" });
    if (up.error) throw new Error(up.error.message);
  });
  afterAll(async () => {
    await cleanup();
    await pg.end();
  });

  test("issued r1: 기사 서명 인라인·직인 없음 → report-r1.pdf 업로드 + pdf_url CAS 기록", async () => {
    const id = await seedIssued();
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    expect((await row(id)).pdf_url).toBe(`${id}/report-r1.pdf`);
    expect(await exists(`${id}/report-r1.pdf`)).toBe(true);
    const data = lastRender()!;
    expect(data.engineerSignatureDataUri).toMatch(/^data:image\/png;base64,/);
    expect(data.approval).toBeUndefined();
  });

  test("승인 후 r2: 직인을 리포트 폴더로 복사(확장자 보존)해 인라인, report-r2.pdf, r1 파일은 그대로", async () => {
    const id = await seedIssued();
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    await approve(id);
    expect((await row(id)).pdf_url).toBeNull(); // 트리거가 승인 전이 시 리셋
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 2, expected_status: "approved" });
    const r = await row(id);
    expect(r).toEqual({ status: "approved", pdf_revision: 2, pdf_url: `${id}/report-r2.pdf` });
    expect(await exists(`${id}/approval-stamp.png`)).toBe(true);
    expect(await exists(`${id}/report-r1.pdf`)).toBe(true);
    const data = lastRender()!;
    expect(data.approval?.name).toBe("배이사");
    expect(data.approval?.title).toBe("영업부 이사");
    expect(data.approval?.stampDataUri).toMatch(/^data:image\/png;base64,/);
  });

  test("stale 잡(r1)이 승인(r2) 뒤에 돌면 렌더 없이 폐기 — 최신본을 덮지 않는다", async () => {
    const id = await seedIssued();
    await approve(id);
    const before = vi.mocked(buildServiceReportPdf).mock.calls.length;
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    expect(vi.mocked(buildServiceReportPdf).mock.calls.length).toBe(before);
    expect((await row(id)).pdf_url).toBeNull();
    expect(await exists(`${id}/report-r1.pdf`)).toBe(false);
  });

  test("같은 잡 2회(중복) — 두 번째는 pdf_url 있음으로 폐기, 렌더 1회", async () => {
    const id = await seedIssued();
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    const before = vi.mocked(buildServiceReportPdf).mock.calls.length;
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    expect(vi.mocked(buildServiceReportPdf).mock.calls.length).toBe(before);
  });

  test("기사 서명 없는 기존 발행본: engineerSignatureDataUri 없이 렌더(이름 폴백)", async () => {
    const id = await seedIssued({ engineerSig: false });
    await processServiceReportPdfJob(supabase, { service_report_id: id, revision: 1, expected_status: "issued" });
    expect(lastRender()!.engineerSignatureDataUri).toBeUndefined();
    expect((await row(id)).pdf_url).toBe(`${id}/report-r1.pdf`);
  });

  test("승인본인데 직인 원본이 스토리지에 없으면 throw(재시도 → failed 표면화)", async () => {
    const id = await seedIssued();
    await pg.query("begin");
    await pg.query("select set_config('app.service_reports_status_change','1',true)");
    await pg.query(
      "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_stamp_path=$3 where id=$1",
      [id, DIR, `${DIR}/stamp-9999.png`],
    );
    await pg.query("commit");
    await expect(
      processServiceReportPdfJob(supabase, { service_report_id: id, revision: 2, expected_status: "approved" }),
    ).rejects.toThrow(/approval-stamps/);
    expect((await row(id)).pdf_url).toBeNull();
  });
});
