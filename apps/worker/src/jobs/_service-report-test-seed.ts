import { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@jhtechsaas/shared";

// 서비스 리포트 워커 통합 테스트 공용 시드(#285). 테스트 파일이 아니라 vitest가 여기서 describe를 등록하지 않는다.
// 상태 전이는 tx-local 플래그(app.service_reports_status_change)가 필요해 REST로 못 만들므로 pg로 직접 시드.
// 사용자는 auth admin API로 생성(GoTrue가 읽을 수 있는 완전한 행 — pg 직접 insert는 getUserById가 못 찾는다).

export const LOCAL_URL = "http://127.0.0.1:54321";
export const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const LOCAL_DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

export type ReportStatus = "issued" | "approved" | "voided";

export class ServiceReportSeed {
  readonly supabase: SupabaseClient = createServiceClient(LOCAL_URL, LOCAL_SERVICE_KEY);
  readonly pg = new Client({ connectionString: LOCAL_DB_URL });
  private seq = 0;
  private bizBase: number;
  private readonly userEmails: string[] = [];

  // customerName = 이 테스트 파일의 고유 태그(정리 스코프). bizBase = 파일별로 다른 대역(사업자번호 충돌 방지).
  constructor(readonly customerName: string, bizBase: number) {
    this.bizBase = bizBase;
  }

  async connect(): Promise<void> {
    await this.pg.connect();
  }
  async end(): Promise<void> {
    await this.pg.end();
  }

  async createUser(email: string): Promise<string> {
    const { data, error } = await this.supabase.auth.admin.createUser({ email, password: "worker-test-pw-1234", email_confirm: true });
    if (error || !data.user) throw new Error(`테스트 사용자 생성 실패(${email}): ${error?.message}`);
    this.userEmails.push(email);
    return data.user.id;
  }

  async reportIds(): Promise<string[]> {
    const r = await this.pg.query("select id from public.service_reports where customer_name=$1", [this.customerName]);
    return r.rows.map((x) => x.id as string);
  }

  // 내 리포트·잡·스토리지·사용자만 정리(다른 통합 테스트의 잡을 건드리지 않는다).
  async cleanup(): Promise<void> {
    const ids = await this.reportIds();
    for (const id of ids) {
      const { data } = await this.supabase.storage.from("service-reports").list(id);
      if (data?.length) await this.supabase.storage.from("service-reports").remove(data.map((o) => `${id}/${o.name}`));
    }
    if (ids.length) {
      await this.pg.query("delete from public.email_log where service_report_id = any($1::uuid[])", [ids]);
      await this.pg.query("delete from public.jobs where payload->>'service_report_id' = any($1::text[])", [ids]);
    }
    await this.pg.query("delete from public.service_reports where customer_name=$1", [this.customerName]);
    await this.pg.query("delete from public.service_requests where contact_company=$1", [this.customerName]);
    await this.pg.query("delete from public.company_equipment where company_id in (select id from public.companies where name=$1)", [this.customerName]);
    await this.pg.query("delete from public.companies where name=$1", [this.customerName]);
    if (this.userEmails.length) {
      await this.pg.query("delete from auth.users where email = any($1::text[])", [this.userEmails]);
      this.userEmails.length = 0;
    }
  }

  // 이전 실행이 남긴 사용자 정리(이메일 목록 기준) — beforeAll에서 createUser 전에 호출.
  async purgeUsers(emails: string[]): Promise<void> {
    await this.pg.query("delete from auth.users where email = any($1::text[])", [emails]);
  }

  // tx-local 플래그와 함께 한 트랜잭션에서 UPDATE(상태 전이용).
  async transition(sql: string, params: unknown[]): Promise<void> {
    await this.pg.query("begin");
    try {
      await this.pg.query("select set_config('app.service_reports_status_change','1',true)");
      await this.pg.query(sql, params);
      await this.pg.query("commit");
    } catch (e) {
      await this.pg.query("rollback");
      throw e;
    }
  }

  private async createCompany(): Promise<string> {
    this.seq += 1;
    const biz = String(this.bizBase + this.seq);
    const co = await this.pg.query("insert into public.companies (name, biz_no) values ($1,$2) returning id", [this.customerName, biz]);
    return co.rows[0].id as string;
  }

  // 보유장비 1대(이력 표 테스트용). 리포트는 발행 후 동결되므로 company_equipment_id는 seedIssued 옵션으로 미리 넣는다.
  async createEquipment(label = "JU-2513UV"): Promise<string> {
    const companyId = await this.createCompany();
    const r = await this.pg.query("insert into public.company_equipment (company_id, label) values ($1,$2) returning id", [companyId, label]);
    return r.rows[0].id as string;
  }

  /**
   * 고객 서명(+기사 서명)이 실제 스토리지에 있는 issued 리포트(pdf_revision=1) 1건.
   * 트리거가 만든 잡(PDF·알림)은 지운다 — 테스트는 process 함수를 직접 부른다.
   */
  async seedIssued(opts: {
    createdBy: string;
    engineerSig?: boolean;
    senderHiworks?: string | null;
    recipientEmail?: string | null;
    companyEquipmentId?: string;
  }): Promise<string> {
    const companyId = await this.createCompany();
    const biz = String(this.bizBase + this.seq);
    const rq = await this.pg.query(
      `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
       values ($1,$2,$3,'received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
      [biz, companyId, this.customerName],
    );
    const rp = await this.pg.query(
      `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
          charge_type, visit_fee, follow_needed, recipient_email, created_by)
       values ($1,$2,$3,'JU-2513UV','{접촉불량}','진단','조치','paid',10000,false,$4,$5) returning id`,
      [rq.rows[0].id, companyId, this.customerName, opts.recipientEmail === undefined ? "cust@jhtech.test" : opts.recipientEmail, opts.createdBy],
    );
    const id = rp.rows[0].id as string;
    await this.supabase.storage.from("service-reports").upload(`${id}/signature.png`, PNG, { contentType: "image/png" });
    const engSig = opts.engineerSig ?? true;
    if (engSig) await this.supabase.storage.from("service-reports").upload(`${id}/engineer-signature.png`, PNG, { contentType: "image/png" });
    await this.pg.query(
      "update public.service_reports set signature_path=$2, engineer_signature_path=$3, company_equipment_id=$4 where id=$1",
      [id, `${id}/signature.png`, engSig ? `${id}/engineer-signature.png` : null, opts.companyEquipmentId ?? null],
    );
    await this.transition(
      "update public.service_reports set status='issued', issued_at=now(), engineer_name='홍기사', sender_hiworks_user_id=$2 where id=$1",
      [id, opts.senderHiworks === undefined ? "eng" : opts.senderHiworks],
    );
    await this.pg.query("delete from public.jobs where payload->>'service_report_id'=$1", [id]);
    return id;
  }

  // issued → approved(직인 경로 스냅샷). pdf_url이 없으면 트리거 조건상 무관(승인 RPC가 아니라 직접 전이).
  async approve(id: string, approverId: string, stampPath: string): Promise<void> {
    await this.transition(
      "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_title='영업부 이사', approver_stamp_path=$3 where id=$1",
      [id, approverId, stampPath],
    );
    await this.pg.query("delete from public.jobs where payload->>'service_report_id'=$1", [id]);
  }

  async void(id: string, byId: string): Promise<void> {
    await this.transition("update public.service_reports set status='voided', void_reason='테스트', voided_by=$2 where id=$1", [id, byId]);
    await this.pg.query("delete from public.jobs where payload->>'service_report_id'=$1", [id]);
  }

  // 워커(service_role) 경로로 pdf_url 기록(동결 트리거가 service_role만 허용).
  async setPdfUrl(id: string, path: string): Promise<void> {
    const { error } = await this.supabase.from("service_reports").update({ pdf_url: path }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async row(id: string): Promise<{ status: string; pdf_revision: number; pdf_url: string | null }> {
    const r = await this.pg.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [id]);
    return r.rows[0] as { status: string; pdf_revision: number; pdf_url: string | null };
  }

  async objectExists(path: string): Promise<boolean> {
    const { data } = await this.supabase.storage.from("service-reports").download(path);
    return !!data;
  }
}
