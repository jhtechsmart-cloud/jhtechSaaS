import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { makePng } from "./_png";

// #285 #D — 후속 방문 리포트 e2e: 후속조치가 남은 확정본 → 현장 홈 '후속 방문 대기' → 후속 리포트 작성
// (고객·장비 프리필 + 원 리포트 참고 카드) → 확정 → 부모의 후속조치가 자동 처리 완료(AC9).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ENG_EMAIL = "e2e-followup-eng@jhtech.test";
const ENG_PASSWORD = "followupEng1234";
const CUSTOMER = "E2E후속고객상사";
const DEVICE = "JU-2513UV 후속장비";
const PNG = makePng();

test.use({ viewport: { width: 390, height: 844 } });

function svc(path: string, init: RequestInit = {}) {
  return fetch(`${LOCAL_SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: LOCAL_SERVICE_ROLE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`, ...(init.headers ?? {}) },
  });
}
async function uploadObject(path: string, body: Buffer, contentType: string) {
  const res = await svc(`/storage/v1/object/service-reports/${path}`, {
    method: "POST",
    body: new Blob([new Uint8Array(body)], { type: contentType }),
    headers: { "Content-Type": contentType, "x-upsert": "true" },
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
}

const pg = new Client({ connectionString: DB_URL });
let engId = "";
let parentId = "";

async function deleteEngineer() {
  const res = await svc("/auth/v1/admin/users?per_page=1000").catch(() => null);
  if (!res || !res.ok) return;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const u = (body.users ?? []).find((x) => x.email === ENG_EMAIL);
  if (u) await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" }).catch(() => {});
}

async function cleanup() {
  const ids = (await pg.query("select id from public.service_reports where customer_name=$1", [CUSTOMER])).rows.map((r) => r.id as string);
  if (ids.length) {
    await pg.query("delete from public.jobs where payload->>'service_report_id' = any($1::text[])", [ids]);
    // 후속(child) → 부모 순으로 지워야 FK에 걸리지 않는다
    await pg.query("delete from public.service_reports where parent_report_id = any($1::uuid[])", [ids]);
    await pg.query("delete from public.service_reports where id = any($1::uuid[])", [ids]);
  }
  await pg.query("delete from public.company_equipment where company_id in (select id from public.companies where name=$1)", [CUSTOMER]);
  await pg.query("delete from public.service_requests where contact_company=$1", [CUSTOMER]);
  await pg.query("delete from public.companies where name=$1", [CUSTOMER]);
}

test.beforeAll(async () => {
  await pg.connect();
  await cleanup();
  await deleteEngineer();
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ENG_EMAIL, password: ENG_PASSWORD, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`기사 계정 생성 실패: ${await created.text()}`);
  engId = ((await created.json()) as { id: string }).id;
  await pg.query(
    "update public.profiles set permissions='{service_reports.write}', name='E2E후속기사', position='기술팀', must_change_password=false where id=$1",
    [engId],
  );

  // 후속조치가 남은 확정본(부모) 1건
  const biz = String(9300000000 + Math.floor(Math.random() * 1_000_000));
  const co = await pg.query("insert into public.companies (name, biz_no) values ($1,$2) returning id", [CUSTOMER, biz]);
  const rq = await pg.query(
    `insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ($1,$2,$3,'received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`,
    [biz, co.rows[0].id, CUSTOMER],
  );
  const rp = await pg.query(
    `insert into public.service_reports (service_request_id, company_id, customer_name, customer_tel, device_name, device_serial,
        faults, diagnosis, action_text, charge_type, visit_fee, follow_needed, follow_memo, follow_date, created_by)
     values ($1,$2,$3,'02-857-4120',$4,'SN-0417','{접촉불량}','SSR 접촉불량','재납땜 후 정상','paid',90000,true,'SSR 모듈 교체','2026-09-20',$5) returning id`,
    [rq.rows[0].id, co.rows[0].id, CUSTOMER, DEVICE, engId],
  );
  parentId = rp.rows[0].id as string;
  await uploadObject(`${parentId}/signature.png`, PNG, "image/png");
  await uploadObject(`${parentId}/engineer-signature.png`, PNG, "image/png");
  await pg.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [
    parentId, `${parentId}/signature.png`, `${parentId}/engineer-signature.png`,
  ]);
  await pg.query("begin");
  await pg.query("select set_config('app.service_reports_status_change','1',true)");
  await pg.query("update public.service_reports set status='issued', issued_at=now(), engineer_name='E2E후속기사' where id=$1", [parentId]);
  await pg.query("commit");
});
test.afterAll(async () => {
  await cleanup();
  await deleteEngineer();
  await pg.end();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ENG_EMAIL);
  await page.getByLabel("비밀번호", { exact: true }).fill(ENG_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
}

// 단계 전환은 URL 내비게이션(RSC 왕복) — 다른 spec과 병렬로 돌면 dev 서버가 느려져 기본 5초로는 부족하다.
async function expectStep(page: Page, heading: string) {
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({ timeout: 20_000 });
}

async function drawSignature(page: Page, label: string) {
  const canvas = page.getByLabel(label);
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`서명 캔버스 없음: ${label}`);
  await page.mouse.move(box.x + 30, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 60, { steps: 12 });
  await page.mouse.move(box.x + 280, box.y + 110, { steps: 12 });
  await page.mouse.up();
}

test("후속 방문 대기 → 후속 리포트(프리필·참고 카드) → 확정 → 부모 후속조치 자동 처리", async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/field$/, { timeout: 20_000 });

  // 현장 홈: 후속 방문 대기 카드
  const card = page.locator("section", { hasText: "후속 방문 대기" });
  await expect(card.getByText(CUSTOMER)).toBeVisible();
  await expect(card.getByText("SSR 모듈 교체")).toBeVisible();
  await expect(card.getByText("예정 2026-09-20")).toBeVisible();
  await card.getByRole("link", { name: "후속 리포트 작성 →" }).click();
  await page.waitForURL(/\/field\/report\?parent=/, { timeout: 20_000 });

  // 참고 카드(기본 접힘) — 펼치면 원 리포트 조치·후속 예정
  const ref = page.getByText(/후속 방문 · 원 리포트 SR-/);
  await expect(ref).toBeVisible();
  await expect(page.getByText("재납땜 후 정상")).toBeHidden();
  await ref.click();
  await expect(page.getByText("재납땜 후 정상")).toBeVisible();
  await expect(page.getByText("SSR 모듈 교체 (예정일 2026-09-20)")).toBeVisible();

  // 1단계: 등록 고객이 선택된 상태로 프리필 → 2단계: 장비명 프리필(부모가 직접입력 장비)
  await expect(page.getByText("선택됨", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(CUSTOMER).first()).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expectStep(page, "장비 정보");
  await expect(page.getByLabel("장비명 직접 입력")).toHaveValue(DEVICE);
  await page.getByRole("button", { name: "다음" }).click();

  // 3~7단계: 이번 방문 내용은 비어 있어야 한다(진단·조치 새로 작성)
  await expectStep(page, "점검·고장 내역");
  await expect(page.getByLabel("점검 내역")).toHaveValue("");
  await page.getByRole("button", { name: "전기·제어", exact: false }).first().click();
  await page.getByRole("button", { name: "접촉불량", exact: true }).click();
  await page.getByLabel("점검 내역").fill("[접촉불량] 재방문 점검");
  await page.getByRole("button", { name: "다음" }).click();
  await expectStep(page, "조치·수리 내역");
  await page.getByLabel("조치 내역").fill("SSR 모듈 교체 완료");
  await page.getByRole("button", { name: "다음" }).click();
  for (const h of ["향후 일정", "교체 부품", "청구 내역"]) {
    await expectStep(page, h);
    await page.getByRole("button", { name: "다음" }).click();
  }

  // 8단계: 고객 서명 → 기사 서명 → 확정
  await expect(page.getByRole("button", { name: "고객 확인 요청 (서명 받기)" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "고객 확인 요청 (서명 받기)" }).click();
  await drawSignature(page, "고객 서명 입력");
  await page.getByRole("button", { name: "서명 완료" }).click();
  await expect(page.getByText("✓ 고객 서명 완료")).toBeVisible({ timeout: 15_000 });
  await drawSignature(page, "기사 서명 입력");
  await page.getByRole("button", { name: "기사 서명 저장" }).click();
  await expect(page.getByText("✓ 기사 서명 완료")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "리포트 확정" }).click();
  await expect(page.getByText("리포트가 확정되었습니다")).toBeVisible({ timeout: 20_000 });

  // DB: 후속 리포트가 부모를 가리키고, 부모의 후속조치가 자동 처리됐다(AC9)
  const child = await pg.query("select id, parent_report_id, status from public.service_reports where parent_report_id=$1", [parentId]);
  expect(child.rows).toHaveLength(1);
  expect(child.rows[0].status).toBe("issued");
  const parent = await pg.query("select follow_resolved_at, follow_resolved_by from public.service_reports where id=$1", [parentId]);
  expect(parent.rows[0].follow_resolved_at).not.toBeNull();
  expect(parent.rows[0].follow_resolved_by).toBe(engId);

  // 처리된 뒤에는 현장 홈 대기 목록에서 빠진다
  await page.goto("/field");
  await expect(page.locator("section", { hasText: "후속 방문 대기" }).getByText(CUSTOMER)).toHaveCount(0);
});
