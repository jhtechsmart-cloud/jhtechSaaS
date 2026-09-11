// #285 공용 픽스처 — 결재 흐름 테스트 3파일(flow/rpc/policies)이 같은 사용자 4명·같은 전이 헬퍼를 쓴다.
// 테스트 파일이 아니므로(.test 아님) vitest가 여기서 describe를 등록하지 않는다.
import type { Client } from "pg";
import { asPostgres, seedAuthUser, UID } from "./helpers";

export const ENG = "00000000-0000-0000-0000-0000000000f1";   // 기사(write)
export const DIR = "00000000-0000-0000-0000-0000000000f2";   // 이사(approve)
export const MGMT = "00000000-0000-0000-0000-0000000000f3";  // 관리부(complete + email.send)
export const VIEW = "00000000-0000-0000-0000-0000000000f4";  // 영업(view)
export const STAMP = `${DIR}/stamp-1757400000.png`;
export const ENG_SIG = "engineer-signature.png";

let c: Client;
export function bindClient(client: Client): void { c = client; }

export const flag = () => c.query("select set_config('app.service_reports_status_change','1',true)");
// 플래그는 tx-local이라 한 트랜잭션 안의 테스트에서는 명시적으로 내려야 "플래그 없음" 경로를 검증할 수 있다.
export const unflag = () => c.query("select set_config('app.service_reports_status_change','',true)");

export interface Seeded { companyId: string; requestId: string; reportId: string }
let seq = 0;

// 사용자 4명은 한 트랜잭션에서 1회만 시드(같은 tx에서 seed()를 여러 번 부르면 중복 insert가 나므로 가드).
async function seedUsers(): Promise<void> {
  const exists = await c.query("select 1 from auth.users where id=$1", [ENG]);
  if (exists.rowCount) return;
  await seedAuthUser(c, UID.admin, "ap-admin@jhtech.test");
  await seedAuthUser(c, ENG, "ap-eng@jhtech.test");
  await seedAuthUser(c, DIR, "ap-dir@jhtech.test");
  await seedAuthUser(c, MGMT, "ap-mgmt@jhtech.test");
  await seedAuthUser(c, VIEW, "ap-view@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{service_reports.write}', name='홍기사', hiworks_user_id='eng' where id=$1", [ENG]);
  await c.query(
    "update public.profiles set permissions='{service_reports.approve}', name='배이사', position='영업부 이사', hiworks_user_id='dir', approval_stamp_path=$2 where id=$1",
    [DIR, STAMP],
  );
  await c.query("update public.profiles set permissions='{service_reports.complete,email.send}', hiworks_user_id='mgmt' where id=$1", [MGMT]);
  await c.query("update public.profiles set permissions='{service_reports.view}' where id=$1", [VIEW]);
  // 직인 버킷은 ④ 정책 마이그가 만든다 — 픽스처는 존재만 보장(중복 무해)
  await c.query("insert into storage.buckets (id, name, public) values ('approval-stamps','approval-stamps',false) on conflict (id) do nothing");
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('approval-stamps', $1, '{\"size\":2048}'::jsonb)", [STAMP]);
}

/** 고객 서명·기사 서명이 모두 있는 draft 리포트 + 연결 의뢰(received) 1건. */
export async function seed(opts: { follow?: boolean } = {}): Promise<Seeded> {
  await asPostgres(c);
  await seedUsers();
  seq += 1;
  const biz = String(5000000000 + seq);
  const co = await c.query("insert into public.companies (name, biz_no, email) values ('결재상사', $1, 'cust@jhtech.test') returning id", [biz]);
  const companyId = co.rows[0].id as string;
  const rq = await c.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,'결재상사','received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, companyId],
  );
  const rp = await c.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
        charge_type, visit_fee, follow_needed, recipient_email, created_by)
     values ($1,$2,'결재상사','JU-2513UV','{접촉불량}','진단','조치','paid',10000,$3,'cust@jhtech.test',$4) returning id`,
    [rq.rows[0].id, companyId, opts.follow ?? false, ENG],
  );
  const reportId = rp.rows[0].id as string;
  for (const n of ["signature.png", ENG_SIG]) {
    await c.query("insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{\"size\":1024}'::jsonb)", [`${reportId}/${n}`]);
  }
  await c.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [
    reportId, `${reportId}/signature.png`, `${reportId}/${ENG_SIG}`,
  ]);
  return { companyId, requestId: rq.rows[0].id as string, reportId };
}

// 전이 헬퍼 — RPC를 거치지 않고 플래그로 직접 전환(트리거 단위 검증용). RPC 테스트는 별도.
export async function toIssued(id: string): Promise<void> {
  await asPostgres(c); await flag();
  await c.query("update public.service_reports set status='issued', issued_at=now() where id=$1", [id]);
}
export async function setPdf(id: string, rev: number): Promise<void> {
  await asPostgres(c);
  await c.query("update public.service_reports set pdf_url=$2 where id=$1", [id, `${id}/report-r${rev}.pdf`]);
}
export async function toApproved(id: string): Promise<void> {
  await asPostgres(c); await flag();
  await c.query(
    "update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_title='영업부 이사', approver_stamp_path=$3 where id=$1",
    [id, DIR, STAMP],
  );
}
export async function toCompleted(id: string): Promise<void> {
  await setPdf(id, 2);
  await asPostgres(c); await flag();
  await c.query(
    "update public.service_reports set status='completed', completed_at=now(), completed_by=$2, tax_invoice_status='not_required' where id=$1",
    [id, MGMT],
  );
}
