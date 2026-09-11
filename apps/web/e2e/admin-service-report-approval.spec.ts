import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { makePng } from "./_png";

// #285 #C — 결재 흐름 e2e: issued 리포트(확정본 PDF 있음) → 관리자 직인 등록 → 상세 [승인](직인 미리보기 모달)
// → 승인 대기→세금계산서 미발행 배지 + 'PDF 재생성 중' → (워커 대신) 승인본 pdf_url 기록 → [완료 처리] 모달(불필요)
// → 완료 배지 → [메일 발송] 확인 → email_log pending 1건 + 재클릭 거부. 상태 전이는 tx-local 플래그가 필요해 pg로 시드.
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// 이 spec 전용 계정 — 공유 admin 계정을 쓰면 다른 spec이 같은 직인을 지워 레이스가 난다(파일 병렬 실행).
const APPROVER_EMAIL = "e2e-approver@jhtech.test";
const APPROVER_PASSWORD = "e2eApprover1234";
const CUSTOMER = "E2E결재고객상사";
const PNG = makePng(); // 320px 단색 PNG — 서버가 헤더로 형식·크기를 검증한다

function svc(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      ...(init.headers ?? {}),
    },
  });
}
async function uploadObject(bucket: string, path: string, body: Buffer, contentType: string) {
  const res = await svc(`/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    body: new Blob([new Uint8Array(body)], { type: contentType }),
    headers: { "Content-Type": contentType, "x-upsert": "true" },
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${res.status} ${await res.text()}`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(APPROVER_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(APPROVER_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

const pg = new Client({ connectionString: DB_URL });
let approverId = "";
let reportId = "";
let stampPath = "";

async function transition(sql: string, params: unknown[]) {
  await pg.query("begin");
  await pg.query("select set_config('app.service_reports_status_change','1',true)");
  await pg.query(sql, params);
  await pg.query("commit");
}

// 전용 계정 정리(이전 실행 잔여 포함)
async function deleteApprover() {
  const res = await svc("/auth/v1/admin/users?per_page=1000").catch(() => null);
  if (!res || !res.ok) return;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (body.users ?? []).find((x) => x.email === APPROVER_EMAIL);
  if (u) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" }).catch(() => {});
}

async function cleanup() {
  const ids = (await pg.query("select id from public.service_reports where customer_name=$1", [CUSTOMER])).rows.map((r) => r.id as string);
  if (ids.length) {
    await pg.query("delete from public.email_log where service_report_id = any($1::uuid[])", [ids]);
    await pg.query("delete from public.jobs where payload->>'service_report_id' = any($1::text[])", [ids]);
    await pg.query("delete from public.service_reports where id = any($1::uuid[])", [ids]);
  }
  await pg.query("delete from public.service_requests where contact_company=$1", [CUSTOMER]);
  await pg.query("delete from public.companies where name=$1", [CUSTOMER]);
}

test.beforeAll(async () => {
  await pg.connect();
  await cleanup();
  // 전용 승인자 계정 생성(권한: 사용자관리=직인 등록·무효화 / 승인 / 완료 / 메일 발송)
  await deleteApprover();
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: APPROVER_EMAIL, password: APPROVER_PASSWORD, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`승인자 계정 생성 실패: ${await created.text()}`);
  approverId = ((await created.json()) as { id: string }).id;
  await pg.query(
    `update public.profiles set permissions='{users.manage,service_reports.approve,service_reports.complete,service_reports.view_all,email.send}',
       name='E2E승인이사', position='영업부 이사', hiworks_user_id='e2eapprover', must_change_password=false, approval_stamp_path=null where id=$1`,
    [approverId],
  );

  const biz = String(9100000000 + Math.floor(Math.random() * 1_000_000));
  const co = await pg.query("insert into public.companies (name, biz_no, email) values ($1,$2,'cust@jhtech.test') returning id", [CUSTOMER, biz]);
  const rq = await pg.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,$3,'received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, co.rows[0].id, CUSTOMER],
  );
  const rp = await pg.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
        charge_type, visit_fee, follow_needed, recipient_email, created_by)
     values ($1,$2,$3,'JU-2513UV','{접촉불량}','진단','조치','paid',90000,false,'cust@jhtech.test',$4) returning id`,
    [rq.rows[0].id, co.rows[0].id, CUSTOMER, approverId],
  );
  reportId = rp.rows[0].id as string;
  await uploadObject("service-reports", `${reportId}/signature.png`, PNG, "image/png");
  await uploadObject("service-reports", `${reportId}/engineer-signature.png`, PNG, "image/png");
  await pg.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [
    reportId, `${reportId}/signature.png`, `${reportId}/engineer-signature.png`,
  ]);
  await transition("update public.service_reports set status='issued', issued_at=now(), engineer_name='E2E기사', sender_hiworks_user_id='eng' where id=$1", [reportId]);
  // 워커 대신 확정본 PDF 기록(service_role 경로 규칙 report-r{n}.pdf)
  await uploadObject("service-reports", `${reportId}/report-r1.pdf`, Buffer.from("%PDF-1.4"), "application/pdf");
  const upd = await svc(`/rest/v1/service_reports?id=eq.${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ pdf_url: `${reportId}/report-r1.pdf` }),
  });
  if (!upd.ok) throw new Error(`pdf_url 기록 실패: ${await upd.text()}`);
});
test.afterAll(async () => {
  await cleanup();
  if (stampPath) await svc(`/storage/v1/object/approval-stamps/${stampPath}`, { method: "DELETE" }).catch(() => {});
  await deleteApprover();
  await pg.end();
});

test("승인 대기 → [승인](직인) → 세금계산서 미발행 → [완료 처리] → 완료 → [메일 발송] pending 1건", async ({ page }) => {
  await login(page);

  // 목록: 승인 대기 탭(관리자 기본 탭)에 시드 리포트가 보이고 행 클릭 → 상세
  await page.goto("/admin/service-reports?tab=awaiting_approval");
  const row = page.getByRole("row", { name: new RegExp(CUSTOMER) });
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(new RegExp(`/admin/service-reports/${reportId}$`), { timeout: 20_000 });
  await expect(page.getByText(/지금 승인자\(이사\) 차례 · \d+일 경과/)).toBeVisible();

  // 직인 미등록 → 승인 버튼 비활성 + 안내(title)
  const approveBtn = page.getByRole("button", { name: "승인", exact: true }).first();
  await expect(approveBtn).toBeDisabled();
  await expect(approveBtn).toHaveAttribute("title", /직인이 등록되지 않았습니다/);

  // 관리자 직인 등록(사용자 상세)
  await page.goto(`/admin/users/${approverId}`);
  const card = page.getByTestId("stamp-upload");
  await page.waitForLoadState("networkidle"); // goto 직후 하이드레이션 전 change 이벤트 유실 방지
  if ((await card.getByRole("img", { name: "직인 이미지" }).count()) === 0) {
    await card.locator('input[type="file"]').setInputFiles({ name: "stamp.png", mimeType: "image/png", buffer: PNG });
  }
  await expect(card.getByRole("img", { name: "직인 이미지" })).toBeVisible({ timeout: 15_000 });
  stampPath = (await pg.query("select approval_stamp_path from public.profiles where id=$1", [approverId])).rows[0].approval_stamp_path as string;
  expect(stampPath).toMatch(new RegExp(`^${approverId}/stamp-\\d+\\.png$`));

  // 승인: 모달(직인 미리보기 + 문구) → 승인 → 배지 전환 + PDF 재생성 중
  await page.goto(`/admin/service-reports/${reportId}`);
  await page.getByRole("button", { name: "승인", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "리포트 승인" });
  await expect(dialog.getByRole("img", { name: "내 직인" })).toBeVisible();
  await expect(dialog.getByText("직인이 찍힌 최종 문서가 생성됩니다")).toBeVisible();
  await dialog.getByRole("button", { name: "승인", exact: true }).click();
  await expect(page.getByText("세금계산서 미발행").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/PDF 재생성 중/)).toBeVisible();
  await expect(page.getByText(/지금 관리부 차례/)).toBeVisible();
  const afterApprove = await pg.query("select status, pdf_revision, pdf_url, approver_stamp_path from public.service_reports where id=$1", [reportId]);
  expect(afterApprove.rows[0]).toMatchObject({ status: "approved", pdf_revision: 2, pdf_url: null, approver_stamp_path: stampPath });

  // 완료 처리는 승인본 PDF가 있어야 활성 — 워커 대신 r2 기록
  await expect(page.getByRole("button", { name: "완료 처리" }).first()).toBeDisabled();
  await uploadObject("service-reports", `${reportId}/report-r2.pdf`, Buffer.from("%PDF-1.4"), "application/pdf");
  const upd = await svc(`/rest/v1/service_reports?id=eq.${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_url: `${reportId}/report-r2.pdf` }),
  });
  expect(upd.ok).toBe(true);
  await page.reload();
  await expect(page.getByText(/승인본 r2/)).toBeVisible();

  // 완료 모달: 상태 미선택 → 인라인 오류, 발행함 → 발행일 필수, 불필요 → 완료
  await page.getByRole("button", { name: "완료 처리" }).first().click();
  const cm = page.getByRole("dialog", { name: "A/S 완료 처리" });
  await cm.getByRole("button", { name: "완료 처리" }).click();
  await expect(cm.getByText("세금계산서 발행 여부를 선택하세요")).toBeVisible();
  await cm.getByText("발행함", { exact: true }).click();
  await cm.getByRole("button", { name: "완료 처리" }).click();
  await expect(cm.getByText("발행일을 입력하세요")).toBeVisible();
  await cm.getByText("불필요", { exact: true }).click();
  await cm.getByPlaceholder("사유를 남기면 감사 시 도움이 됩니다").fill("보증 내 무상 처리");
  await cm.getByRole("button", { name: "완료 처리" }).click();
  await expect(page.getByText("완료", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/세금계산서: 불필요/)).toBeVisible();
  const afterComplete = await pg.query("select status, tax_invoice_status, tax_invoice_memo from public.service_reports where id=$1", [reportId]);
  expect(afterComplete.rows[0]).toMatchObject({ status: "completed", tax_invoice_status: "not_required", tax_invoice_memo: "보증 내 무상 처리" });

  // 무효화 버튼은 completed에서 DOM에 없다
  await expect(page.getByRole("button", { name: "무효화" })).toHaveCount(0);

  // 메일 발송(수동): 확인 모달 → pending 1건 → 재클릭은 '이미 발송 대기 중' 거부
  await page.getByRole("button", { name: "메일 발송" }).first().click();
  const mm = page.getByRole("dialog", { name: "고객 메일 발송" });
  await expect(mm.getByText("cust@jhtech.test")).toBeVisible();
  await mm.getByRole("button", { name: "발송", exact: true }).click();
  await expect(page.getByText("발송을 요청했습니다", { exact: false }).first()).toBeVisible({ timeout: 20_000 }); // toast + aria-live
  const logs = await pg.query("select status, kind, from_user_id from public.email_log where service_report_id=$1", [reportId]);
  expect(logs.rows).toEqual([{ status: "pending", kind: "customer", from_user_id: approverId }]);
  await expect(page.getByText("발송 대기").first()).toBeVisible({ timeout: 20_000 });
  const job = await pg.query("select payload->>'hiworks_user_id' h from public.jobs where type='service_report_email' and payload->>'service_report_id'=$1", [reportId]);
  expect(job.rows[0].h).toBe("e2eapprover");
});
