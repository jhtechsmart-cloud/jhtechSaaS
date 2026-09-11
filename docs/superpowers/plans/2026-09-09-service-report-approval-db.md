# 서비스 리포트 결재 흐름 — PR #A (DB·권한·상태기계·알림 트리거·shared 상태 상수) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `service_reports`를 `draft→issued→approved→completed(+voided)` 5상태 결재 흐름으로 확장하고, 승인·완료·수동 메일·KPI·승인 알림 RPC/트리거/정책을 DB에 갖춘다(UI·워커는 PR #B/#C).

**Architecture:** 기존 패턴 그대로 — tx-local 플래그 + BEFORE UPDATE 동결 트리거(전이 쌍별 허용 셋), SECURITY DEFINER RPC(권한 키 + FOR UPDATE + 단일 UPDATE), AFTER 트리거 → `jobs` 큐. PDF는 `pdf_revision` 세대 번호 + 잡 payload `expected_status/revision`으로 stale-write를 차단(워커 CAS는 #B). 마이그레이션은 의도별 4파일(스키마 / 트리거 / RPC / 정책) + 롤백 4파일.

**Tech Stack:** Supabase Postgres(plpgsql), Vitest(db-tests = pg `set role` + `request.jwt.claims`, 로컬 supabase 54322), TypeScript(shared·web 타입/상수).

**Spec:** GitHub #285 + 오버라이드 코멘트(2026-09-09) + `~/.gstack/projects/jhtechsmart-cloud-jhtechSaaS/main-autoplan-review-20260909-151805.md` (결정 D-A1~A7, D-B*, D-C1~C27).

## Global Constraints

- 상태 값: `'draft','issued','approved','completed','voided'`. `tax_invoice_status`: `'invoiced'|'not_required'`(D-A5).
- 전이는 tx-local 플래그 `app.service_reports_status_change='1'` 세팅한 RPC만. 허용 전이: draft→issued / issued→approved / approved→completed / issued→voided / approved→voided. completed→voided 금지(T3).
- 동결(issued/approved/completed 동일 상태 UPDATE)에서 허용 컬럼 = `pdf_url, follow_resolved_at, follow_resolved_by`만(D-C9). `pdf_revision`은 트리거만 증가.
- 모든 RPC: `security definer`, `set search_path = ''`, `revoke all ... from public, anon`, `grant execute ... to authenticated`(kpis·notice 조회 포함).
- 권한 키 2개: `service_reports.approve`("서비스 리포트 승인(결재)"), `service_reports.complete`("서비스 리포트 완료 처리(세금계산서)"). SALES_PRESET 미포함.
- 재정의는 **최신 마이그 기준 복사**: `issue_service_report`/`upsert_service_report` = `20260720170000`, `get_service_report_pdf_status` = `20260720190000`, `claim_next_job` = `20260611120000`(스테일 회수 포함).
- 롤백 스크립트는 `supabase/rollback/<ts>_<name>_down.sql`(단수 디렉토리). 마이그 타임스탬프 `20260909170000`~`20260909170003`.
- 코드 주석 한국어. `as any` 0. 게이트: `pnpm --filter @jhtechsaas/shared test` · `pnpm --filter web test` · `pnpm --filter web typecheck` · `pnpm --filter worker exec tsc --noEmit` · `pnpm -r lint` · `pnpm -r build` · `supabase db reset` → `pnpm --filter @jhtechsaas/db-tests test:rls`.
- 이 PR은 UI 없음. 단 `issue_service_report`가 기사 서명을 요구하므로 로컬 `field-service-report.spec.ts` e2e는 #B'(현장 UI) 전까지 실패 → 해당 spec은 `test.skip`(사유 주석 #285 #B') 처리하고 PR 본문에 명시. prod 적용은 #A~#C 배치(D-C3).

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `packages/shared/src/service-report-status.ts` (신규) | 상태 5종·전이 가능 집합·라벨 단일 출처(웹·워커 import) |
| `packages/shared/src/service-report-status.test.ts` (신규) | 상수 계약 테스트 |
| `packages/shared/src/permissions.ts` | 권한 키 2개 추가 |
| `packages/shared/src/permissions.test.ts` | 개수 22→24 |
| `supabase/migrations/20260909170000_service_report_approval_schema.sql` | 컬럼·CHECK·인덱스·profiles 직인·email_log kind/인덱스·jobs run_after/유니크·claim_next_job |
| `supabase/migrations/20260909170001_service_report_approval_triggers.sql` | before_insert/before_update 재정의·PDF enqueue(revision)·알림 enqueue/취소·자동 메일 트리거 제거 |
| `supabase/migrations/20260909170002_service_report_approval_rpc.sql` | upsert/issue 재정의·approve·complete·void·resolve_follow·retry/pdf_status·enqueue_service_report_email·service_report_kpis·get_service_report_approval_notice |
| `supabase/migrations/20260909170003_service_report_approval_policies.sql` | service_reports SELECT RLS·email_log SELECT·스토리지(service-reports select/insert/delete)·approval-stamps 버킷+정책 |
| `supabase/rollback/20260909170000~3_*_down.sql` | 역순 롤백 4파일(D-C15) |
| `packages/db-tests/src/service_report_approval_schema.test.ts` (신규) | 스키마·jobs run_after·인덱스 |
| `packages/db-tests/src/service_report_approval_flow.test.ts` (신규) | 전이·동결·RPC 5종·의뢰 전이·후속 불변식 |
| `packages/db-tests/src/service_report_approval_notice.test.ts` (신규) | 알림 잡·KPI·메일 enqueue |
| `packages/db-tests/src/service_report_approval_policies.test.ts` (신규) | RLS·스토리지·직인 버킷 |
| `packages/db-tests/src/service_reports.test.ts` | 기존 "발행 시 의뢰 done" 단언 → in_progress로 갱신(회귀 가드) + 기사 서명 픽스처 추가 |
| `apps/web/src/lib/service-reports/status.ts` (신규) | shared 재export + 웹 배지 라벨(색은 #C) |
| `apps/web/src/lib/service-reports/types.ts` `admin-actions.ts` `equipment-history.ts` `actions.ts` | status 타입 5종·`SERVICE_REPORT_FINALIZED` 치환 |
| `apps/web/src/lib/auth/guard.ts` `console.ts` `apps/web/src/app/admin/layout.tsx` | 새 키 2개 동기화 |
| `apps/web/src/lib/users/delete-blockers.ts` + `actions.ts` | 승인·완료 이력 카운트 차단(D-C18) |
| `apps/web/e2e/field-service-report.spec.ts` | `test.skip` (#B'까지) |

---

### Task 1: shared 상태 상수 단일 출처

**Files:**
- Create: `packages/shared/src/service-report-status.ts`
- Create: `packages/shared/src/service-report-status.test.ts`
- Modify: `packages/shared/src/index.ts` (export 추가)

**Interfaces:**
- Produces: `SERVICE_REPORT_STATUSES: readonly ['draft','issued','approved','completed','voided']`, `type ServiceReportStatus`, `SERVICE_REPORT_FINALIZED = ['issued','approved','completed']`(발행 이후 유효 문서 — 이력·통계·PDF 렌더 허용), `SERVICE_REPORT_MAILABLE = ['approved','completed']`(고객 메일 가능), `SERVICE_REPORT_STATUS_LABEL: Record<ServiceReportStatus,string>`, `TAX_INVOICE_STATUSES = ['invoiced','not_required']`, `canTransition(from,to): boolean`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/shared/src/service-report-status.test.ts
import { describe, expect, test } from "vitest";
import {
  SERVICE_REPORT_STATUSES, SERVICE_REPORT_FINALIZED, SERVICE_REPORT_MAILABLE,
  SERVICE_REPORT_STATUS_LABEL, TAX_INVOICE_STATUSES, canTransition,
} from "./service-report-status";

describe("service-report-status — 단일 출처 계약", () => {
  test("상태 5종 순서 고정(draft→issued→approved→completed, voided)", () => {
    expect([...SERVICE_REPORT_STATUSES]).toEqual(["draft", "issued", "approved", "completed", "voided"]);
  });
  test("FINALIZED = 발행 이후 유효 3종, MAILABLE = 승인 이후 2종", () => {
    expect([...SERVICE_REPORT_FINALIZED]).toEqual(["issued", "approved", "completed"]);
    expect([...SERVICE_REPORT_MAILABLE]).toEqual(["approved", "completed"]);
  });
  test("라벨은 5종 전부 한글", () => {
    for (const s of SERVICE_REPORT_STATUSES) expect(/[^\x00-\x7F]/.test(SERVICE_REPORT_STATUS_LABEL[s])).toBe(true);
    expect(SERVICE_REPORT_STATUS_LABEL.issued).toBe("승인 대기");
    expect(SERVICE_REPORT_STATUS_LABEL.approved).toBe("세금계산서 미발행");
  });
  test("전이표: 허용 5 / 금지(completed→voided, draft→approved 등)", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "approved")).toBe(true);
    expect(canTransition("approved", "completed")).toBe(true);
    expect(canTransition("issued", "voided")).toBe(true);
    expect(canTransition("approved", "voided")).toBe(true);
    expect(canTransition("completed", "voided")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("voided", "issued")).toBe(false);
  });
  test("세금계산서 상태 값은 invoiced|not_required(리포트 issued와 혼동 금지)", () => {
    expect([...TAX_INVOICE_STATUSES]).toEqual(["invoiced", "not_required"]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @jhtechsaas/shared test -- service-report-status` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

```ts
// packages/shared/src/service-report-status.ts
// 서비스 리포트 상태기계 단일 출처(#285) — DB CHECK·트리거 전이표·웹 배지·워커 가드가 전부 이 값을 참조한다.
// ⚠️ 상태 추가 시 DB CHECK(20260909170000)·트리거 전이표(20260909170001)와 반드시 동기.
export const SERVICE_REPORT_STATUSES = ["draft", "issued", "approved", "completed", "voided"] as const;
export type ServiceReportStatus = (typeof SERVICE_REPORT_STATUSES)[number];

/** 발행 이후 유효 문서 — 이력·통계·PDF 렌더·후속 처리 대상. voided 제외. */
export const SERVICE_REPORT_FINALIZED = ["issued", "approved", "completed"] as const satisfies readonly ServiceReportStatus[];
/** 고객 메일 발송 가능(승인본만 — 미승인본은 고객에게 나가지 않는다). */
export const SERVICE_REPORT_MAILABLE = ["approved", "completed"] as const satisfies readonly ServiceReportStatus[];

export const SERVICE_REPORT_STATUS_LABEL: Record<ServiceReportStatus, string> = {
  draft: "임시",
  issued: "승인 대기",
  approved: "세금계산서 미발행",
  completed: "완료",
  voided: "무효",
};

export const TAX_INVOICE_STATUSES = ["invoiced", "not_required"] as const;
export type TaxInvoiceStatus = (typeof TAX_INVOICE_STATUSES)[number];

/** 허용 전이표 — DB 트리거(20260909170001)와 동일. */
const TRANSITIONS: Record<ServiceReportStatus, readonly ServiceReportStatus[]> = {
  draft: ["issued"],
  issued: ["approved", "voided"],
  approved: ["completed", "voided"],
  completed: [],
  voided: [],
};
export function canTransition(from: ServiceReportStatus, to: ServiceReportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```
`packages/shared/src/index.ts`에 `export * from "./service-report-status";` 추가.

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `git add packages/shared/src/service-report-status.ts packages/shared/src/service-report-status.test.ts packages/shared/src/index.ts && git commit -m "feat(shared): 서비스 리포트 상태 5종 단일 출처 상수(#285)"`

---

### Task 2: 권한 키 2개 + 웹 동기화(guard·sidebar·console·delete-blockers)

**Files:**
- Modify: `packages/shared/src/permissions.ts` (service_reports.view_all 항목 뒤)
- Modify: `packages/shared/src/permissions.test.ts:12` (22→24)
- Modify: `apps/web/src/lib/auth/guard.ts:136-137`, `apps/web/src/lib/auth/console.ts:5-22`, `apps/web/src/app/admin/layout.tsx:86,99`
- Modify: `apps/web/src/lib/users/delete-blockers.ts`, `apps/web/src/lib/users/delete-blockers.test.ts`, `apps/web/src/lib/users/actions.ts`(차단 카운트 쿼리)

**Interfaces:**
- Produces: `PermissionKey`에 `"service_reports.approve" | "service_reports.complete"`. `requireServiceReportsRead`가 5키 OR. `DeleteUserBlockers`에 `service_report_approvals: number`(approved_by 또는 completed_by = 사용자인 리포트 수).

- [ ] **Step 1: 실패 테스트** — `permissions.test.ts`의 "registry는 22개" → 24개로 바꾸고, 새 테스트 추가:
```ts
test("결재 키 2개는 A/S 그룹, SALES_PRESET 미포함", () => {
  const approve = PERMISSION_REGISTRY.find((p) => p.key === "service_reports.approve");
  const complete = PERMISSION_REGISTRY.find((p) => p.key === "service_reports.complete");
  expect(approve?.group).toBe("A/S"); expect(complete?.group).toBe("A/S");
  expect(SALES_PRESET).not.toContain("service_reports.approve");
  expect(SALES_PRESET).not.toContain("service_reports.complete");
});
```
`delete-blockers.test.ts`에: `hasDeleteBlockers({...zeros, service_report_approvals: 1})` → true, `formatDeleteBlockers` 문자열에 "승인·완료한 서비스 리포트 1건" 포함.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @jhtechsaas/shared test -- permissions` / `pnpm --filter web test -- delete-blockers` → FAIL
- [ ] **Step 3: 구현**
  - registry에 추가:
```ts
  {
    key: "service_reports.approve",
    label: "서비스 리포트 승인(결재)",
    description: "확정된 서비스 리포트를 등록 직인으로 승인(본부장 결재). 승인 버튼은 이 키 보유자에게만 표시(#285)",
    group: "A/S",
  },
  {
    key: "service_reports.complete",
    label: "서비스 리포트 완료 처리(세금계산서)",
    description: "승인본 확인 후 세금계산서 발행 여부를 기록하고 A/S를 완료 처리(관리부, #285)",
    group: "A/S",
  },
```
  - `guard.ts`: `requireServiceReportsRead`·`requireEquipmentDetailRead` 배열에 `"service_reports.approve","service_reports.complete"` 추가. 신규 `export const requireServiceReportsApprove = () => requirePermission("service_reports.approve");` `requireServiceReportsComplete`.
  - `console.ts` CONSOLE_CAPABILITIES에 두 키 추가(승인만 가진 이사가 콘솔 셸 진입).
  - `layout.tsx` 86·99행 `anyOf([...])`에 두 키 추가.
  - `delete-blockers.ts`: 타입·LABELS에 `service_report_approvals: "승인·완료한 서비스 리포트"` 추가(순서 마지막). `actions.ts`의 차단 카운트 쿼리에 `service_reports` `or(approved_by.eq.<id>,completed_by.eq.<id>)` count 추가(기존 쿼리 패턴 그대로, `head:true count:'exact'`).
- [ ] **Step 4: 통과 확인** — shared test·web test·`pnpm --filter web typecheck` PASS
- [ ] **Step 5: 커밋** — `feat: 서비스 리포트 승인·완료 권한 키 + 콘솔 가드·사이드바·삭제 차단 동기화(#285)`

---

### Task 3: 마이그 ① 스키마(컬럼·CHECK·인덱스·직인·email_log·jobs run_after·claim_next_job)

**Files:**
- Create: `supabase/migrations/20260909170000_service_report_approval_schema.sql`
- Create: `supabase/rollback/20260909170000_service_report_approval_schema_down.sql`
- Create: `packages/db-tests/src/service_report_approval_schema.test.ts`

**Interfaces:**
- Produces: `service_reports` 신규 컬럼 13개 + `pdf_revision`, `profiles.approval_stamp_path`, `email_log.kind`, `jobs.run_after`, 인덱스 `jobs_service_report_pdf_queued_uniq`, `jobs_service_report_notice_active_uniq`, `email_log_active_service_report`(pending·sending·customer만), `claim_next_job()`이 run_after를 존중.

- [ ] **Step 1: 실패 테스트**
```ts
// packages/db-tests/src/service_report_approval_schema.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, inRollbackTx, makeClient } from "./helpers";
let c: Client; beforeAll(async () => { c = await makeClient(); }); afterAll(async () => { await c.end(); });
async function expectReject(fn: () => Promise<unknown>, re: RegExp) { await c.query("savepoint sp"); await expect(fn()).rejects.toThrow(re); await c.query("rollback to savepoint sp"); }

describe("#285 스키마", () => {
  test("status CHECK가 approved/completed를 허용하고 그 외 값은 거부", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query("select pg_get_constraintdef(oid) d from pg_constraint where conname='service_reports_status_check'");
      expect(r.rows[0].d).toMatch(/approved/); expect(r.rows[0].d).toMatch(/completed/);
    });
  });
  test("tax_invoice_status는 invoiced|not_required만", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const co = await c.query("insert into public.companies (name) values ('스키마상사') returning id");
      const rp = await c.query("insert into public.service_reports (company_id, customer_name, device_name, faults, diagnosis, action_text) values ($1,'스키마상사','장비','{a}','d','a') returning id", [co.rows[0].id]);
      await expectReject(() => c.query("update public.service_reports set tax_invoice_status='issued' where id=$1", [rp.rows[0].id]), /tax_invoice_status/);
    });
  });
  test("email_log 활성 유니크는 pending·sending·customer만 — sent 후 재발송 행 삽입 가능", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const co = await c.query("insert into public.companies (name) values ('메일상사') returning id");
      const rp = await c.query("insert into public.service_reports (company_id, customer_name, device_name, faults, diagnosis, action_text) values ($1,'메일상사','장비','{a}','d','a') returning id", [co.rows[0].id]);
      const id = rp.rows[0].id;
      await c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','sent')", [id]);
      await c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','pending')", [id]); // sent 후 재발송 OK
      await expectReject(() => c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','pending')", [id]), /duplicate key/);
      // 알림(kind) 행은 유니크 대상 아님
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'x@y.z','pending','approval_notice')", [id]);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'x2@y.z','pending','approval_notice')", [id]);
    });
  });
  test("claim_next_job: run_after 미도래 잡은 건너뛰고, 도래 잡은 집는다(스테일 회수 유지)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.jobs (type, payload, run_after) values ('t_future','{}', now() + interval '1 day')");
      const due = await c.query("insert into public.jobs (type, payload, run_after) values ('t_due','{}', now() - interval '1 minute') returning id");
      await asService(c);
      const j = await c.query("select public.claim_next_job() as j");
      expect(j.rows[0].j.id).toBe(due.rows[0].id);
      const j2 = await c.query("select public.claim_next_job() as j");
      expect(j2.rows[0].j).toBeNull();
      // 스테일 processing 회수 조건이 남아있는지(정의문 검사)
      await asPostgres(c);
      const def = await c.query("select pg_get_functiondef('public.claim_next_job()'::regprocedure) d");
      expect(def.rows[0].d).toMatch(/interval '5 minutes'/); expect(def.rows[0].d).toMatch(/run_after/);
    });
  });
  test("PDF 잡 queued 유니크·알림 잡 활성 유니크", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("insert into public.jobs (type, payload) values ('service_report_pdf', '{\"service_report_id\":\"11111111-1111-1111-1111-111111111111\"}')");
      await expectReject(() => c.query("insert into public.jobs (type, payload) values ('service_report_pdf', '{\"service_report_id\":\"11111111-1111-1111-1111-111111111111\"}')"), /duplicate key/);
      await c.query("insert into public.jobs (type, payload) values ('service_report_approval_notice', '{\"service_report_id\":\"11111111-1111-1111-1111-111111111111\",\"kind\":\"initial\"}')");
      await c.query("insert into public.jobs (type, payload) values ('service_report_approval_notice', '{\"service_report_id\":\"11111111-1111-1111-1111-111111111111\",\"kind\":\"reminder\"}')");
      await expectReject(() => c.query("insert into public.jobs (type, payload) values ('service_report_approval_notice', '{\"service_report_id\":\"11111111-1111-1111-1111-111111111111\",\"kind\":\"initial\"}')"), /duplicate key/);
    });
  });
  test("profiles.approval_stamp_path 경로 CHECK", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await expectReject(() => c.query("update public.profiles set approval_stamp_path='bad/path.png' where false"), /never/); // placeholder 방지용 아님 — 아래 실 검사
      const u = await c.query("select id from public.profiles limit 1");
      if (u.rowCount) {
        await expectReject(() => c.query("update public.profiles set approval_stamp_path='x/stamp.png' where id=$1", [u.rows[0].id]), /approval_stamp_path/);
        await c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [u.rows[0].id, `${u.rows[0].id}/stamp-1757400000.png`]);
      }
    });
  });
});
```
(위 6번째 테스트의 첫 `expectReject(... where false)` 줄은 삭제 — 실 검사 2줄만 남긴다.)

- [ ] **Step 2: 실패 확인** — `supabase db reset` 후 `pnpm --filter @jhtechsaas/db-tests test:rls -- service_report_approval_schema` → FAIL(컬럼 없음)
- [ ] **Step 3: 마이그 작성**

```sql
-- #285 서비스 리포트 결재 흐름 ① 스키마.
-- 상태 5종(draft→issued→approved→completed, voided) + 승인·완료·세금계산서·기사서명·후속 부모·PDF 세대 컬럼,
-- 관리자 직인 포인터, email_log 종류(kind)/재발송 허용 인덱스, jobs 지연 실행(run_after)·중복 방지 인덱스.
-- 트리거·RPC·정책은 ②③④ 마이그. 롤백 = supabase/rollback/20260909170000_*_down.sql.

-- 1. 상태 CHECK 확장
alter table public.service_reports drop constraint if exists service_reports_status_check;
alter table public.service_reports
  add constraint service_reports_status_check
  check (status in ('draft', 'issued', 'approved', 'completed', 'voided'));

-- 2. 컬럼
alter table public.service_reports
  add column if not exists engineer_signature_path text,      -- <id>/engineer-signature.png (draft에서 기록, 결재 '담당' 칸)
  add column if not exists pdf_revision int not null default 0, -- PDF 세대(issue·approve 전이마다 +1, 트리거가 증가) — stale-write 차단 키
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles (id) on delete no action, -- set null은 동결 트리거·CHECK와 충돌 → 삭제 차단(delete-blockers)
  add column if not exists approver_name text,               -- 승인 시 profiles.name 스냅샷
  add column if not exists approver_title text,              -- 승인 시 profiles.position 스냅샷
  add column if not exists approver_stamp_path text,         -- 승인 시점의 직인 원본 경로 스냅샷(approval-stamps 버킷, 버전 파일명이라 불변)
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles (id) on delete no action,
  add column if not exists tax_invoice_status text
    constraint service_reports_tax_invoice_status_check check (tax_invoice_status in ('invoiced', 'not_required')),
  add column if not exists tax_invoice_date date,
  add column if not exists tax_invoice_memo text
    constraint service_reports_tax_invoice_memo_check check (tax_invoice_memo is null or length(tax_invoice_memo) <= 500),
  add column if not exists parent_report_id uuid references public.service_reports (id) on delete set null; -- 후속 리포트(1단)

alter table public.service_reports
  add constraint service_reports_completed_tax_check
    check (status <> 'completed' or tax_invoice_status is not null),
  add constraint service_reports_approved_at_check
    check (status not in ('approved', 'completed') or approved_at is not null),
  add constraint service_reports_engineer_sig_path_check
    check (engineer_signature_path is null
           or engineer_signature_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/engineer-signature\.png$');

create index if not exists service_reports_status_idx on public.service_reports (status);
create index if not exists service_reports_parent_idx on public.service_reports (parent_report_id);
-- 후속조치 대기 부분 인덱스: issued 전용 → 발행 이후 3상태
drop index if exists public.service_reports_follow_open;
create index service_reports_follow_open on public.service_reports (follow_date)
  where follow_needed and follow_resolved_at is null and status in ('issued', 'approved', 'completed');

comment on column public.service_reports.pdf_revision is 'PDF 세대. 워커는 payload.revision과 다르면 렌더 결과를 폐기(CAS).';
comment on column public.service_reports.tax_invoice_status is 'invoiced=세금계산서 발행함 / not_required=발행 불필요(관리부 완료 시 기록)';

-- 3. 관리자 직인(승인 권한자) — 버전 파일명(stamp-<epoch>.<ext>) 강제: 덮어쓰기 없음 → 승인본 스냅샷 불변
alter table public.profiles
  add column if not exists approval_stamp_path text
    constraint profiles_approval_stamp_path_check
    check (approval_stamp_path is null
           or approval_stamp_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/stamp-[0-9]+\.(png|jpg|jpeg|webp)$');

-- 4. email_log: 종류 구분 + 재발송 허용(sent 제외, 견적 20260617120000 동형)
alter table public.email_log
  add column if not exists kind text not null default 'customer'
    constraint email_log_kind_check check (kind in ('customer', 'approval_notice'));
drop index if exists public.email_log_active_service_report;
create unique index email_log_active_service_report
  on public.email_log (service_report_id)
  where status in ('pending', 'sending') and kind = 'customer';

-- 5. jobs: 지연 실행 + 중복 방지
alter table public.jobs add column if not exists run_after timestamptz;
create index if not exists jobs_claim_idx on public.jobs (status, run_after, created_at);
-- PDF 잡: 같은 리포트의 queued 1건(전이 연달아 발생 시 트리거가 기존 queued의 payload를 최신 revision으로 갱신)
create unique index if not exists jobs_service_report_pdf_queued_uniq
  on public.jobs ((payload ->> 'service_report_id'))
  where type = 'service_report_pdf' and status = 'queued';
-- 알림 잡: 리포트·kind별 활성 1건
create unique index if not exists jobs_service_report_notice_active_uniq
  on public.jobs ((payload ->> 'service_report_id'), (payload ->> 'kind'))
  where type = 'service_report_approval_notice' and status in ('queued', 'processing');

-- 6. claim_next_job — ⚠️ 최신판(20260611120000, 스테일 회수 포함) 기준 + run_after 조건
create or replace function public.claim_next_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row public.jobs;
begin
  update public.jobs
  set status = 'failed',
      last_error = 'stale: 회수 한도 초과(워커 사망 추정)',
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '5 minutes'
    and attempts >= 3;

  select id into v_id
  from public.jobs
  where (
          status = 'queued'
          and (run_after is null or run_after <= now())   -- 지연 잡(재알림)은 도래 전 집지 않는다
        )
     or (status = 'processing'
         and updated_at < now() - interval '5 minutes'
         and attempts < 3)
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = v_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
```

롤백 `20260909170000_service_report_approval_schema_down.sql`:
```sql
-- 롤백 #285 ①(스키마). ⚠️ 반드시 ④→③→②→① 순서. approved/completed 행이 있으면 ②(트리거) 롤백에서 issued로 되돌린 뒤 실행.
-- 데이터 소실: approved_*/completed_*/tax_*/parent_report_id/engineer_signature_path. 실행 전 백업 테이블 생성.
create table if not exists public.service_reports_approval_backup as
  select id, status, pdf_revision, engineer_signature_path, approved_at, approved_by, approver_name, approver_title,
         approver_stamp_path, completed_at, completed_by, tax_invoice_status, tax_invoice_date, tax_invoice_memo, parent_report_id
  from public.service_reports;
create or replace function public.claim_next_job() ... -- 20260611120000 본문 그대로(run_after 조건 제거)
drop index if exists public.jobs_service_report_notice_active_uniq;
drop index if exists public.jobs_service_report_pdf_queued_uniq;
drop index if exists public.jobs_claim_idx;
alter table public.jobs drop column if exists run_after;
drop index if exists public.email_log_active_service_report;
create unique index email_log_active_service_report on public.email_log (service_report_id) where status in ('pending','sending','sent');
alter table public.email_log drop column if exists kind;
alter table public.profiles drop column if exists approval_stamp_path;
drop index if exists public.service_reports_follow_open;
create index service_reports_follow_open on public.service_reports (follow_date) where follow_needed and follow_resolved_at is null and status = 'issued';
drop index if exists public.service_reports_parent_idx;
drop index if exists public.service_reports_status_idx;
alter table public.service_reports
  drop constraint if exists service_reports_engineer_sig_path_check,
  drop constraint if exists service_reports_approved_at_check,
  drop constraint if exists service_reports_completed_tax_check,
  drop column if exists parent_report_id, drop column if exists tax_invoice_memo, drop column if exists tax_invoice_date,
  drop column if exists tax_invoice_status, drop column if exists completed_by, drop column if exists completed_at,
  drop column if exists approver_stamp_path, drop column if exists approver_title, drop column if exists approver_name,
  drop column if exists approved_by, drop column if exists approved_at, drop column if exists pdf_revision,
  drop column if exists engineer_signature_path;
alter table public.service_reports drop constraint if exists service_reports_status_check;
alter table public.service_reports add constraint service_reports_status_check check (status in ('draft','issued','voided'));
select count(*) as backup_rows from public.service_reports_approval_backup;
```

- [ ] **Step 4: 통과 확인** — `supabase db reset` → 해당 테스트 PASS + 기존 `jobs_queue.test.ts`·`email_log.test.ts` PASS
- [ ] **Step 5: 커밋** — `feat(db): 서비스 리포트 결재 스키마 — 5상태·승인/완료/세금계산서 컬럼·pdf_revision·직인·email_log kind·jobs run_after(#285 ①)`

---

### Task 4: 마이그 ② 트리거(전이 쌍별 동결·PDF enqueue 세대·알림 enqueue/취소·자동 메일 제거)

**Files:**
- Create: `supabase/migrations/20260909170001_service_report_approval_triggers.sql`
- Create: `supabase/rollback/20260909170001_service_report_approval_triggers_down.sql`
- Create: `packages/db-tests/src/service_report_approval_flow.test.ts` (전이·동결 부분; RPC 부분은 Task 5에서 확장)

**Interfaces:**
- Produces: `service_reports_before_update()` — `(old.status,new.status)` 쌍별 허용 컬럼, 전이 시 `pdf_revision := old+1, pdf_url := null`(issued/approved 진입), `voided_at := now()`. `service_reports_enqueue_pdf()` — issued/approved 진입 시 `jobs(service_report_pdf, {service_report_id, revision, expected_status})`, queued 존재 시 payload 갱신. `service_reports_enqueue_approval_notice()` — issued 진입 시 initial + reminder(run_after +3d), approved/voided 진입 시 queued 알림 삭제. `service_reports_enqueue_email_trg` DROP.

- [ ] **Step 1: 실패 테스트**(flow 파일, 전이/동결 부분)
```ts
// packages/db-tests/src/service_report_approval_flow.test.ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";
let c: Client; beforeAll(async () => { c = await makeClient(); }); afterAll(async () => { await c.end(); });
const ENG = "00000000-0000-0000-0000-0000000000f1", DIR = "00000000-0000-0000-0000-0000000000f2", MGMT = "00000000-0000-0000-0000-0000000000f3", VIEW = "00000000-0000-0000-0000-0000000000f4";
async function expectReject(fn: () => Promise<unknown>, re: RegExp) { await c.query("savepoint sp"); await expect(fn()).rejects.toThrow(re); await c.query("rollback to savepoint sp"); }
const flag = () => c.query("select set_config('app.service_reports_status_change','1',true)");

interface S { companyId: string; requestId: string; reportId: string }
async function seed(opts: { follow?: boolean } = {}): Promise<S> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "ap-admin@jhtech.test");
  await seedAuthUser(c, ENG, "ap-eng@jhtech.test"); await seedAuthUser(c, DIR, "ap-dir@jhtech.test");
  await seedAuthUser(c, MGMT, "ap-mgmt@jhtech.test"); await seedAuthUser(c, VIEW, "ap-view@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{service_reports.write}', name='홍기사', hiworks_user_id='eng' where id=$1", [ENG]);
  await c.query("update public.profiles set permissions='{service_reports.approve}', name='배이사', position='영업부 이사', hiworks_user_id='dir', approval_stamp_path=$2 where id=$1", [DIR, `${DIR}/stamp-1757400000.png`]);
  await c.query("update public.profiles set permissions='{service_reports.complete,email.send}', hiworks_user_id='mgmt' where id=$1", [MGMT]);
  await c.query("update public.profiles set permissions='{service_reports.view}' where id=$1", [VIEW]);
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('approval-stamps', $1, '{\"size\":2048}'::jsonb) on conflict do nothing", [`${DIR}/stamp-1757400000.png`]);
  const co = await c.query("insert into public.companies (name, biz_no, email) values ('결재상사','5556667771','cust@jhtech.test') returning id");
  const companyId = co.rows[0].id;
  const rq = await c.query(`insert into public.service_requests (biz_no, company_id, contact_company, status, privacy_consent, privacy_consent_at, privacy_consent_version, fields)
    values ('5556667771',$1,'결재상사','received',true,now(),'v1.1','{"symptom":"x"}'::jsonb) returning id`, [companyId]);
  const rp = await c.query(`insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, charge_type, visit_fee, follow_needed, recipient_email, created_by)
    values ($1,$2,'결재상사','JU-2513UV','{접촉불량}','진단','조치','paid',10000,$3,'cust@jhtech.test',$4) returning id`, [rq.rows[0].id, companyId, opts.follow ?? false, ENG]);
  const reportId = rp.rows[0].id;
  for (const n of ["signature.png", "engineer-signature.png"]) await c.query("insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{\"size\":1024}'::jsonb)", [`${reportId}/${n}`]);
  await c.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [reportId, `${reportId}/signature.png`, `${reportId}/engineer-signature.png`]);
  return { companyId, requestId: rq.rows[0].id, reportId };
}
async function toIssued(id: string) { await asPostgres(c); await flag(); await c.query("update public.service_reports set status='issued', issued_at=now() where id=$1", [id]); }
async function toApproved(id: string) { await asPostgres(c); await flag(); await c.query("update public.service_reports set status='approved', approved_at=now(), approved_by=$2, approver_name='배이사', approver_title='영업부 이사', approver_stamp_path=$3 where id=$1", [id, DIR, `${DIR}/stamp-1757400000.png`]); }
async function toCompleted(id: string) { await asPostgres(c); await flag(); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [id, `${id}/report-r2.pdf`]); await flag(); await c.query("update public.service_reports set status='completed', completed_at=now(), completed_by=$2, tax_invoice_status='not_required' where id=$1", [id, MGMT]); }

describe("#285 전이·동결 트리거", () => {
  test("허용 전이 5경로 + pdf_revision 증가·pdf_url 리셋", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      let r = await c.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "issued", pdf_revision: 1, pdf_url: null });
      await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r1.pdf`]); // 동일 상태 허용 컬럼
      await toApproved(s.reportId);
      r = await c.query("select status, pdf_revision, pdf_url from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "approved", pdf_revision: 2, pdf_url: null });
      await toCompleted(s.reportId);
      r = await c.query("select status, pdf_revision from public.service_reports where id=$1", [s.reportId]);
      expect(r.rows[0]).toMatchObject({ status: "completed", pdf_revision: 2 });
    });
  });
  test("금지 전이: draft→approved, issued→completed, completed→voided, voided→*", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await flag(); await expectReject(() => c.query("update public.service_reports set status='approved', approved_at=now(), approved_by=$2 where id=$1", [s.reportId, DIR]), /허용되지 않는 상태 전환/);
      await toIssued(s.reportId);
      await flag(); await expectReject(() => c.query("update public.service_reports set status='completed', tax_invoice_status='not_required' where id=$1", [s.reportId]), /허용되지 않는 상태 전환/);
      await toApproved(s.reportId); await toCompleted(s.reportId);
      await flag(); await expectReject(() => c.query("update public.service_reports set status='voided', void_reason='x', voided_by=$2 where id=$1", [s.reportId, UID.admin]), /완료된 리포트는 무효화할 수 없습니다/);
    });
  });
  test("플래그 없이 status 변경 거부 / approved 전이에 approved_by 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await expectReject(() => c.query("update public.service_reports set status='approved' where id=$1", [s.reportId]), /전용 RPC/);
      await flag(); await expectReject(() => c.query("update public.service_reports set status='approved', approved_at=now() where id=$1", [s.reportId]), /approved_by/);
    });
  });
  test("동결: issued/approved/completed 각각에서 본문·승인·세금 필드 사후 변경 거부, pdf_url·follow_resolved_*만 허용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId);
      const frozen = ["total=1", "diagnosis='x'", "approved_at=now()", "tax_invoice_status='invoiced'"];
      for (const set of frozen) await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      await c.query("update public.service_reports set follow_resolved_at=now(), follow_resolved_by=$2 where id=$1", [s.reportId, ENG]);
      await toApproved(s.reportId);
      for (const set of frozen.concat(["approver_name='x'", "pdf_revision=9"])) await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      await toCompleted(s.reportId);
      for (const set of frozen.concat(["completed_at=now()", "tax_invoice_memo='m'"])) await expectReject(() => c.query(`update public.service_reports set ${set} where id=$1`, [s.reportId]), /수정할 수 없습니다/);
      await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r2b.pdf`]);
    });
  });
  test("PDF 잡: issued 1건(revision 1) → approved 시 queued 잡 payload가 revision 2·expected approved로 갱신(중복 생성 없음)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      let j = await c.query("select payload from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      expect(j.rowCount).toBe(1); expect(j.rows[0].payload).toMatchObject({ revision: 1, expected_status: "issued" });
      await toApproved(s.reportId);
      j = await c.query("select payload, status from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      expect(j.rowCount).toBe(1); expect(j.rows[0].payload).toMatchObject({ revision: 2, expected_status: "approved" });
    });
  });
  test("PDF 잡: 기존 잡이 processing이면 새 queued 잡을 추가한다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await c.query("update public.jobs set status='processing' where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      await toApproved(s.reportId);
      const j = await c.query("select status from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1 order by created_at", [s.reportId]);
      expect(j.rows.map((r) => r.status)).toEqual(["processing", "queued"]);
    });
  });
  test("자동 고객 메일 트리거 제거: pdf_url 기록해도 email_log 0건", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r1.pdf`]);
      const e = await c.query("select count(*)::int n from public.email_log where service_report_id=$1 and kind='customer'", [s.reportId]);
      expect(e.rows[0].n).toBe(0);
    });
  });
  test("알림 잡: issued 시 initial(즉시)+reminder(run_after≈+3d) 2건, approved 시 queued 알림 삭제", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      const j = await c.query("select payload->>'kind' kind, run_after from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1 order by created_at", [s.reportId]);
      expect(j.rows.map((r) => r.kind)).toEqual(["initial", "reminder"]);
      expect(j.rows[0].run_after).toBeNull();
      const days = (new Date(j.rows[1].run_after).getTime() - Date.now()) / 86400000; expect(days).toBeGreaterThan(2.9); expect(days).toBeLessThan(3.1);
      await toApproved(s.reportId);
      const left = await c.query("select count(*)::int n from public.jobs where type='service_report_approval_notice' and payload->>'service_report_id'=$1 and status='queued'", [s.reportId]);
      expect(left.rows[0].n).toBe(0);
    });
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @jhtechsaas/db-tests test:rls -- service_report_approval_flow` → FAIL(허용되지 않는 전환 등)
- [ ] **Step 3: 마이그 작성**

```sql
-- #285 ② 트리거. 전이는 (old,new) 쌍별 허용 컬럼 셋으로 검사한다(동일 상태 UPDATE는 pdf_url·follow_*만).
-- PDF 잡은 세대(revision)를 payload에 실어 워커가 stale 결과를 폐기할 수 있게 한다(D-C8).
-- 고객 메일 자동 발송 트리거는 제거(수동 RPC enqueue_service_report_email로 대체, ③).

-- 1. BEFORE INSERT — 신규 서버 통제 컬럼 초기화(발행 이후 필드는 INSERT로 못 채움)
create or replace function public.service_reports_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := public.next_service_report_seq_no();
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  new.status := 'draft';
  new.issued_at := null;
  new.pdf_url := null;
  new.pdf_revision := 0;
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.follow_resolved_at := null; new.follow_resolved_by := null;
  new.approved_at := null; new.approved_by := null; new.approver_name := null; new.approver_title := null; new.approver_stamp_path := null;
  new.completed_at := null; new.completed_by := null;
  new.tax_invoice_status := null; new.tax_invoice_date := null; new.tax_invoice_memo := null;
  return new;
end; $$;

-- 2. BEFORE UPDATE — 상태기계
--   draft ──issue──▶ issued ──approve──▶ approved ──complete──▶ completed
--                      │                    │
--                      └──void(관리자)───────┴──▶ voided        completed→void ✗
--   동결 상태(issued/approved/completed)에서 동일 상태 UPDATE 허용 컬럼 = pdf_url, follow_resolved_at, follow_resolved_by.
--   전이별 추가 허용 컬럼은 아래 case. pdf_revision은 트리거만 증가(issued·approved 진입 시).
create or replace function public.service_reports_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_common constant text[] := array['pdf_url', 'follow_resolved_at', 'follow_resolved_by'];
  v_allowed text[];
  v_check boolean := true;   -- draft→issued만 전체 자유(확정 RPC가 스냅샷 기록)
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.pdf_revision := old.pdf_revision;   -- 앱이 임의로 못 바꿈(전이 시 아래서 증가)

  if old.status = 'voided' then
    raise exception '무효화된 리포트는 수정할 수 없습니다';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('app.service_reports_status_change', true), '') <> '1' then
      raise exception '리포트 상태 변경은 전용 RPC로만 가능합니다';
    end if;
    if old.status = 'draft' and new.status = 'issued' then
      v_check := false;
      new.pdf_revision := old.pdf_revision + 1;
      new.pdf_url := null;
    elsif old.status = 'issued' and new.status = 'approved' then
      if new.approved_by is null or new.approved_at is null then
        raise exception '승인자(approved_by)·승인 일시가 필요합니다';
      end if;
      new.pdf_revision := old.pdf_revision + 1;
      new.pdf_url := null;
      v_allowed := v_common || array['status', 'approved_at', 'approved_by', 'approver_name', 'approver_title', 'approver_stamp_path', 'pdf_revision'];
    elsif old.status = 'approved' and new.status = 'completed' then
      if new.tax_invoice_status is null or new.completed_by is null or new.completed_at is null then
        raise exception '세금계산서 상태·완료자·완료 일시가 필요합니다';
      end if;
      v_allowed := v_common || array['status', 'completed_at', 'completed_by', 'tax_invoice_status', 'tax_invoice_date', 'tax_invoice_memo'];
    elsif old.status in ('issued', 'approved') and new.status = 'voided' then
      if new.void_reason is null or btrim(new.void_reason) = '' then
        raise exception '무효화 사유(void_reason)가 필요합니다';
      end if;
      new.voided_at := now();
      v_allowed := v_common || array['status', 'void_reason', 'voided_at', 'voided_by'];
    elsif old.status = 'completed' and new.status = 'voided' then
      raise exception '완료된 리포트는 무효화할 수 없습니다';
    else
      raise exception '허용되지 않는 상태 전환입니다(% → %)', old.status, new.status;
    end if;
  elsif old.status in ('issued', 'approved', 'completed') then
    v_allowed := v_common;
  else
    v_check := false;   -- draft 동일 상태: 자유 편집
  end if;

  if v_check and (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception '발행된 리포트는 수정할 수 없습니다(무효화 또는 새 리포트로 정정)';
  end if;
  return new;
end; $$;

-- 3. PDF enqueue — issued/approved 진입 시. queued 잡이 이미 있으면 payload를 최신 세대로 갱신(유니크 충돌 흡수).
create or replace function public.service_reports_enqueue_pdf()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_payload jsonb;
begin
  if new.status in ('issued', 'approved') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_payload := jsonb_build_object('service_report_id', new.id, 'revision', new.pdf_revision, 'expected_status', new.status);
    begin
      insert into public.jobs (type, payload) values ('service_report_pdf', v_payload);
    exception when unique_violation then
      update public.jobs set payload = v_payload, updated_at = now()
        where type = 'service_report_pdf' and status = 'queued' and payload ->> 'service_report_id' = new.id::text;
    end;
  end if;
  return null;
end; $$;
-- (트리거 service_reports_enqueue_pdf_trg는 기존 정의 유지 — 함수 본문만 교체)

-- 4. 승인 요청 알림 — issued 진입 시 initial + reminder(+3일) 동시 예약(레이스 없음). approved/voided 진입 시 queued 알림 삭제.
create or replace function public.service_reports_enqueue_approval_notice()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    begin
      insert into public.jobs (type, payload)
      values ('service_report_approval_notice', jsonb_build_object('service_report_id', new.id, 'kind', 'initial', 'revision', new.pdf_revision));
    exception when unique_violation then null; end;
    begin
      insert into public.jobs (type, payload, run_after)
      values ('service_report_approval_notice', jsonb_build_object('service_report_id', new.id, 'kind', 'reminder', 'revision', new.pdf_revision), now() + interval '3 days');
    exception when unique_violation then null; end;
  elsif new.status in ('approved', 'voided') and old.status is distinct from new.status then
    delete from public.jobs
      where type = 'service_report_approval_notice' and status = 'queued'
        and payload ->> 'service_report_id' = new.id::text;
  end if;
  return null;
end; $$;
drop trigger if exists service_reports_enqueue_approval_notice_trg on public.service_reports;
create trigger service_reports_enqueue_approval_notice_trg
  after update on public.service_reports
  for each row execute function public.service_reports_enqueue_approval_notice();

-- 5. 고객 메일 자동 발송 제거(UC1: 수동 버튼)
drop trigger if exists service_reports_enqueue_email_trg on public.service_reports;
drop function if exists public.service_reports_enqueue_email();
```

롤백 `..170001_..._down.sql`: ①`alter table public.service_reports disable trigger service_reports_bu;` ②`update public.service_reports set status='issued', approved_at=null, approved_by=null, approver_name=null, approver_title=null, approver_stamp_path=null, completed_at=null, completed_by=null, tax_invoice_status=null, tax_invoice_date=null, tax_invoice_memo=null, pdf_url = replace(pdf_url, '-r'||pdf_revision||'.pdf', '-r1.pdf') where status in ('approved','completed');` ③`enable trigger` ④알림 트리거·함수 drop, PDF enqueue 함수 20260716170100 본문 복원, before_update/insert 20260716170000 본문 복원, 자동 메일 트리거 함수 복원(20260716170100 L482-510) — **메일 트리거는 주석 처리한 채 두고 수동으로 켠다**(복원 직후 pdf 재생성이 재발송을 유발하므로).

- [ ] **Step 4: 통과 확인** — db reset → flow(전이/동결/잡) PASS. 기존 `service_reports.test.ts`의 "email enqueue 멱등" 테스트는 트리거 제거로 실패 → 그 테스트를 "자동 발송 없음(email_log 0건)"으로 갱신(회귀 의도 명시).
- [ ] **Step 5: 커밋** — `feat(db): 서비스 리포트 전이 쌍별 동결 트리거 + PDF 세대 enqueue + 승인 알림 잡 + 자동 메일 제거(#285 ②)`

---

### Task 5: 마이그 ③ RPC(upsert/issue 재정의·approve·complete·void·resolve·retry/status·수동 메일·KPI·알림 조회)

**Files:**
- Create: `supabase/migrations/20260909170002_service_report_approval_rpc.sql`
- Create: `supabase/rollback/20260909170002_service_report_approval_rpc_down.sql`
- Modify: `packages/db-tests/src/service_report_approval_flow.test.ts` (RPC 케이스 추가), `service_report_approval_notice.test.ts` (신규: 메일·KPI·알림 조회)
- Modify: `packages/db-tests/src/service_reports.test.ts` (의뢰 done→in_progress, 기사 서명 픽스처)

**Interfaces:**
- Produces:
  - `upsert_service_report(p_id uuid, p jsonb)` — payload `engineer_signature_path`(경로 `<id>/engineer-signature.png`만, 빈 값→null), `parent_report_id`(uuid|null) 저장.
  - `issue_service_report(p_id)` — 기사 서명 필수(storage 실존 size>0), 부모 검증(D-C14) + 부모 follow_resolved 기록, 의뢰 `received/on_hold→in_progress`.
  - `approve_service_report(p_id uuid) returns jsonb` — approve 권한·status issued·pdf_url not null·직인 등록+storage 실존(size>0)·스냅샷·플래그 UPDATE.
  - `complete_service_report(p_id uuid, p_tax_status text, p_tax_date date, p_memo text) returns jsonb` — complete 권한·status approved·pdf_url not null·`invoiced`면 날짜 필수·memo ≤500·의뢰 done 조건부.
  - `void_service_report(p_id, p_reason)` — issued|approved 허용, completed 거부 메시지, child void 시 부모 follow reopen.
  - `resolve_service_report_follow(p_id)` — `status in (issued,approved,completed)`.
  - `retry_service_report_pdf(p_id)` — `status in (issued,approved)`, 권한에 approve·complete 추가, payload에 revision/expected_status.
  - `get_service_report_pdf_status(p_id)` — 권한 5키.
  - `enqueue_service_report_email(p_id uuid) returns jsonb` — email.send 또는 users.manage·status in (approved,completed)·pdf_url·recipient·**발신자 = auth.uid()의 hiworks_user_id**(없으면 예외)·email_log(kind customer, from_user_id, hiworks_user_id)·jobs(service_report_email {email_log_id, service_report_id})·활성 중복은 unique_violation → '이미 발송 대기 중'.
  - `service_report_kpis() returns jsonb` — `{received, follow_open, awaiting_approval, awaiting_tax, completed_this_month}`(KST 월 앵커), 권한 5키 중 하나.
  - `get_service_report_approval_notice(p_id uuid) returns jsonb` — 행 접근(RLS SELECT와 동일 조건) 검증 후 `{sent_count, last_sent_at}`.

- [ ] **Step 1: 실패 테스트**(flow 파일에 추가)
```ts
describe("#285 RPC", () => {
  test("issue: 기사 서명 없으면 거부, 있으면 통과 + 의뢰 in_progress", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c); await c.query("update public.service_reports set engineer_signature_path=null where id=$1", [s.reportId]);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [s.reportId]), /기사 서명/);
      await asPostgres(c); await c.query("update public.service_reports set engineer_signature_path=$2 where id=$1", [s.reportId, `${s.reportId}/engineer-signature.png`]);
      await asUser(c, ENG); await c.query("select public.issue_service_report($1)", [s.reportId]);
      await asPostgres(c);
      const rq = await c.query("select status from public.service_requests where id=$1", [s.requestId]);
      expect(rq.rows[0].status).toBe("in_progress");
    });
  });
  test("approve: 권한/상태/pdf_url/직인 전제 4거부 → 정상 시 스냅샷·pdf_url null·revision 2", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asUser(c, VIEW); await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /권한/);
      await asUser(c, DIR); await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /PDF/);   // pdf_url null
      await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r1.pdf`]);
      await c.query("update public.profiles set approval_stamp_path=null where id=$1", [DIR]);
      await asUser(c, DIR); await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /직인/);
      await asPostgres(c); await c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [DIR, `${DIR}/stamp-1757400000.png`]);
      await asUser(c, DIR); const r = await c.query("select public.approve_service_report($1) as r", [s.reportId]);
      expect(r.rows[0].r).toMatchObject({ status: "approved", approver_name: "배이사", approver_title: "영업부 이사", pdf_url: null, pdf_revision: 2, approver_stamp_path: `${DIR}/stamp-1757400000.png` });
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /승인 대기 상태가 아닙니다/);
    });
  });
  test("complete: 상태/pdf_url/tax 누락/invoiced+날짜 없음 거부 → 정상 + 의뢰 done", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await asPostgres(c);
      await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r1.pdf`]);
      await asUser(c, MGMT); await expectReject(() => c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]), /승인된 리포트만/);
      await toApproved(s.reportId);
      await asUser(c, MGMT); await expectReject(() => c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]), /PDF/);
      await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r2.pdf`]);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.complete_service_report($1,'issued',null,null)", [s.reportId]), /세금계산서 상태/);
      await expectReject(() => c.query("select public.complete_service_report($1,'invoiced',null,null)", [s.reportId]), /발행일/);
      const r = await c.query("select public.complete_service_report($1,'invoiced','2026-09-30','9월 합산') as r", [s.reportId]);
      expect(r.rows[0].r).toMatchObject({ status: "completed", tax_invoice_status: "invoiced", tax_invoice_memo: "9월 합산" });
      await asPostgres(c);
      const rq = await c.query("select status from public.service_requests where id=$1", [s.requestId]); expect(rq.rows[0].status).toBe("done");
    });
  });
  test("의뢰 done 조건: 후속 미처리면 done 아님 / 버려진 draft가 있어도 done", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId);
      await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, "x/report-r1.pdf".replace("x", s.reportId)]);
      await toApproved(s.reportId); await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r2.pdf`]);
      // 같은 의뢰에 버려진 draft 1건
      await c.query("insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, created_by) values ($1,$2,'결재상사','장비','{a}','d','a',$3)", [s.requestId, s.companyId, ENG]);
      await asUser(c, MGMT); await c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]);
      await asPostgres(c);
      let rq = await c.query("select status from public.service_requests where id=$1", [s.requestId]); expect(rq.rows[0].status).toBe("in_progress"); // 후속 미처리
      await c.query("update public.service_reports set follow_resolved_at=now(), follow_resolved_by=$2 where id=$1", [s.reportId, ENG]);
      // 후속 처리 후 재평가는 다음 complete 시점 — 여기서는 resolve RPC 경유 시 done 전이도 검증
      await asUser(c, ENG); await expectReject(() => c.query("select public.resolve_service_report_follow($1)", [s.reportId]), /처리할 후속조치가 없습니다/);
    });
  });
  test("void: approved 허용, completed 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, UID.admin); const r = await c.query("select public.void_service_report($1,'오발행') as r", [s.reportId]);
      expect(r.rows[0].r.status).toBe("voided");
      const s2 = await seed(); await toIssued(s2.reportId); await toApproved(s2.reportId); await toCompleted(s2.reportId);
      await asUser(c, UID.admin); await expectReject(() => c.query("select public.void_service_report($1,'x')", [s2.reportId]), /완료된 리포트는 무효화할 수 없습니다/);
    });
  });
  test("resolve_follow: approved 리포트도 처리 가능", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, ENG); const r = await c.query("select public.resolve_service_report_follow($1) as r", [s.reportId]);
      expect(r.rows[0].r.follow_resolved_by).toBe(ENG);
    });
  });
  test("후속 리포트: 부모 규칙 4거부 + 정상 확정 시 부모 follow_resolved + child void 시 부모 reopen", async () => {
    await inRollbackTx(c, async () => {
      const p = await seed({ follow: true }); await toIssued(p.reportId);
      const mk = async (parent: string, reqId: string, compId: string) => {
        await asPostgres(c);
        const r = await c.query("insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, charge_type, visit_fee, parent_report_id, created_by) values ($1,$2,'결재상사','JU-2513UV','{접촉불량}','진단','조치','paid',10000,$3,$4) returning id", [reqId, compId, parent, ENG]);
        const id = r.rows[0].id;
        for (const n of ["signature.png", "engineer-signature.png"]) await c.query("insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{\"size\":1024}'::jsonb)", [`${id}/${n}`]);
        await c.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [id, `${id}/signature.png`, `${id}/engineer-signature.png`]);
        return id as string;
      };
      // 거부 1: 다른 의뢰의 부모
      const other = await seed(); await toIssued(other.reportId);
      const bad1 = await mk(other.reportId, p.requestId, p.companyId);
      await asUser(c, ENG); await expectReject(() => c.query("select public.issue_service_report($1)", [bad1]), /같은 의뢰/);
      // 거부 2: 부모가 draft
      await asPostgres(c); const draftParent = await c.query("insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, created_by) values ($1,$2,'결재상사','장비','{a}','d','a',$3) returning id", [p.requestId, p.companyId, ENG]);
      const bad2 = await mk(draftParent.rows[0].id, p.requestId, p.companyId);
      await asUser(c, ENG); await expectReject(() => c.query("select public.issue_service_report($1)", [bad2]), /부모 리포트/);
      // 정상 child
      const child = await mk(p.reportId, p.requestId, p.companyId);
      await asUser(c, ENG); await c.query("select public.issue_service_report($1)", [child]);
      await asPostgres(c);
      let pr = await c.query("select follow_resolved_at, follow_resolved_by from public.service_reports where id=$1", [p.reportId]);
      expect(pr.rows[0].follow_resolved_at).not.toBeNull(); expect(pr.rows[0].follow_resolved_by).toBe(ENG);
      // 거부 3: 2단(child를 부모로)
      const bad3 = await mk(child, p.requestId, p.companyId);
      await asUser(c, ENG); await expectReject(() => c.query("select public.issue_service_report($1)", [bad3]), /후속 리포트를 부모로/);
      // child void → 부모 reopen
      await asUser(c, UID.admin); await c.query("select public.void_service_report($1,'재작성')", [child]);
      await asPostgres(c);
      pr = await c.query("select follow_resolved_at from public.service_reports where id=$1", [p.reportId]);
      expect(pr.rows[0].follow_resolved_at).toBeNull();
    });
  });
});
```
`service_report_approval_notice.test.ts`:
```ts
describe("#285 수동 메일·KPI·알림 조회", () => {
  test("enqueue_service_report_email: issued 거부·approved 허용·발신자=호출자 hiworks·중복 거부·sent 후 재발송", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asUser(c, MGMT); await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /승인된 리포트만/);
      await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r1.pdf`]);
      await toApproved(s.reportId); await asPostgres(c); await c.query("update public.service_reports set pdf_url=$2 where id=$1", [s.reportId, `${s.reportId}/report-r2.pdf`]);
      await asUser(c, VIEW); await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /권한/);
      await asUser(c, MGMT); const r = await c.query("select public.enqueue_service_report_email($1) as r", [s.reportId]);
      expect(r.rows[0].r.status).toBe("pending");
      await asPostgres(c);
      const log = await c.query("select from_user_id, hiworks_user_id, kind, to_email from public.email_log where service_report_id=$1", [s.reportId]);
      expect(log.rows[0]).toMatchObject({ from_user_id: MGMT, hiworks_user_id: "mgmt", kind: "customer", to_email: "cust@jhtech.test" });
      const job = await c.query("select count(*)::int n from public.jobs where type='service_report_email' and payload->>'service_report_id'=$1", [s.reportId]); expect(job.rows[0].n).toBe(1);
      await asUser(c, MGMT); await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /이미 발송 대기 중/);
      await asPostgres(c); await c.query("update public.email_log set status='sent' where service_report_id=$1", [s.reportId]);
      await asUser(c, MGMT); await c.query("select public.enqueue_service_report_email($1)", [s.reportId]); // 재발송 OK
      // 호출자 hiworks 없음 → 거부
      await asPostgres(c); await c.query("update public.profiles set hiworks_user_id=null where id=$1", [MGMT]);
      await c.query("update public.email_log set status='sent' where service_report_id=$1", [s.reportId]);
      await asUser(c, MGMT); await expectReject(() => c.query("select public.enqueue_service_report_email($1)", [s.reportId]), /하이웍스/);
    });
  });
  test("service_report_kpis: 5키 정수, 권한 무관 동일, 권한 없으면 예외", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId);
      const s2 = await seed(); await toIssued(s2.reportId); await toApproved(s2.reportId);
      await asUser(c, VIEW); const a = await c.query("select public.service_report_kpis() as k");
      await asUser(c, DIR); const b = await c.query("select public.service_report_kpis() as k");
      expect(a.rows[0].k).toEqual(b.rows[0].k);
      expect(a.rows[0].k.awaiting_approval).toBeGreaterThanOrEqual(1);
      expect(a.rows[0].k.awaiting_tax).toBeGreaterThanOrEqual(1);
      expect(a.rows[0].k.follow_open).toBeGreaterThanOrEqual(1);
      await asPostgres(c); await c.query("update public.profiles set permissions='{}' where id=$1", [VIEW]);
      await asUser(c, VIEW); await expectReject(() => c.query("select public.service_report_kpis()"), /권한/);
    });
  });
  test("get_service_report_approval_notice: 접근 가능 행만 {sent_count,last_sent_at}", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asPostgres(c); await c.query("insert into public.email_log (service_report_id, to_email, status, kind, sent_at) values ($1,'dir@x.y','sent','approval_notice',now())", [s.reportId]);
      await asUser(c, VIEW); const r = await c.query("select public.get_service_report_approval_notice($1) as r", [s.reportId]);
      expect(r.rows[0].r.sent_count).toBe(1); expect(r.rows[0].r.last_sent_at).not.toBeNull();
      await asPostgres(c); await c.query("update public.profiles set permissions='{}' where id=$1", [VIEW]);
      await asUser(c, VIEW); await expectReject(() => c.query("select public.get_service_report_approval_notice($1)", [s.reportId]), /권한/);
    });
  });
});
```
`service_reports.test.ts`: 기존 seed에 `engineer-signature.png` 객체+경로 추가, "발행 시 신청 done" 단언 → `in_progress`, "email enqueue 멱등" → "자동 발송 없음". Task 4·5 이후 전체 파일 PASS 확인.

- [ ] **Step 2: 실패 확인** — flow·notice 파일 FAIL(함수 없음)
- [ ] **Step 3: 마이그 작성** — 핵심 본문(전체는 구현 시 최신판 복사 후 아래 diff 적용):

```sql
-- #285 ③ RPC. 재정의 원본: upsert/issue = 20260720170000, pdf_status = 20260720190000, retry = 20260716200000, void/resolve = 20260716170100.

-- A. upsert_service_report — 20260720170000 본문 + 아래 3곳 변경
--   (1) declare: v_engineer_sig text; v_parent uuid := nullif(p ->> 'parent_report_id', '')::uuid;
--   (2) 경로 검증 블록 뒤:
--       v_engineer_sig := nullif(btrim(coalesce(p ->> 'engineer_signature_path', '')), '');
--       if p_id is null and v_engineer_sig is not null then raise exception '사진·서명은 첫 임시저장 후 첨부할 수 있습니다'; end if;
--       if p_id is not null and v_engineer_sig is not null and v_engineer_sig <> v_prefix || 'engineer-signature.png' then raise exception '기사 서명 경로가 올바르지 않습니다'; end if;
--       if v_parent is not null and not exists (select 1 from public.service_reports pr where pr.id = v_parent) then raise exception '존재하지 않는 부모 리포트입니다'; end if;
--   (3) INSERT 컬럼/VALUES에 parent_report_id / UPDATE set에 engineer_signature_path = v_engineer_sig, parent_report_id = v_parent 추가.

-- B. issue_service_report — 20260720170000 본문 + 변경
--   (1) declare: v_eng_sig_size int; v_parent public.service_reports;
--   (2) 고객 서명 검증 뒤:
--       if v_row.engineer_signature_path is null then raise exception '기사 서명이 필요합니다(결재 담당 칸)'; end if;
--       select coalesce((o.metadata ->> 'size')::int, 0) into v_eng_sig_size from storage.objects o
--         where o.bucket_id = 'service-reports' and o.name = v_row.engineer_signature_path;
--       if v_eng_sig_size is null or v_eng_sig_size <= 0 then raise exception '기사 서명 파일이 업로드되지 않았습니다 — 다시 서명해 주세요'; end if;
--       -- 후속 리포트 부모 불변식(D-C14): 자기 자신·1단·같은 의뢰·같은 고객·발행 이후 상태만. 부모 FOR UPDATE로 동시 child 직렬화.
--       if v_row.parent_report_id is not null then
--         if v_row.parent_report_id = v_row.id then raise exception '자기 자신을 부모로 지정할 수 없습니다'; end if;
--         select * into v_parent from public.service_reports where id = v_row.parent_report_id for update;
--         if not found then raise exception '존재하지 않는 부모 리포트입니다'; end if;
--         if v_parent.parent_report_id is not null then raise exception '후속 리포트를 부모로 지정할 수 없습니다(1단만)'; end if;
--         if v_parent.status not in ('issued','approved','completed','voided') then raise exception '부모 리포트가 확정 전입니다'; end if;
--         if v_parent.service_request_id is distinct from v_row.service_request_id then raise exception '같은 의뢰의 리포트만 부모로 지정할 수 있습니다'; end if;
--         if v_parent.company_id is distinct from coalesce(v_row.company_id, v_parent.company_id) then raise exception '같은 고객의 리포트만 부모로 지정할 수 있습니다'; end if;
--       end if;
--   (3) 의뢰 전이 블록 교체(UC2·D-C13):
--       if v_row.service_request_id is not null then
--         update public.service_requests set status = 'in_progress'
--           where id = v_row.service_request_id and status in ('received', 'on_hold');
--       end if;
--   (4) status UPDATE 뒤(부모가 있고 voided 아님·후속 미처리면 처리 완료 기록 — 동일 상태 허용 컬럼):
--       if v_parent.id is not null and v_parent.status <> 'voided' and v_parent.follow_needed and v_parent.follow_resolved_at is null then
--         update public.service_reports set follow_resolved_at = now(), follow_resolved_by = v_uid where id = v_parent.id;
--       end if;

-- C. approve_service_report
create or replace function public.approve_service_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_profile public.profiles;
  v_stamp_size int;
begin
  if not public.has_permission(v_uid, 'service_reports.approve') then
    raise exception '서비스 리포트 승인 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
  if v_row.status <> 'issued' then raise exception '승인 대기 상태가 아닙니다(현재: %)', v_row.status; end if;
  if v_row.pdf_url is null then raise exception '확정 PDF가 아직 생성되지 않았습니다 — 잠시 후 승인해 주세요'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.approval_stamp_path is null then
    raise exception '직인이 등록되지 않았습니다 — 관리자에게 등록을 요청하세요';
  end if;
  select coalesce((o.metadata ->> 'size')::int, 0) into v_stamp_size
    from storage.objects o where o.bucket_id = 'approval-stamps' and o.name = v_profile.approval_stamp_path;
  if v_stamp_size is null or v_stamp_size <= 0 then
    raise exception '직인 파일을 찾을 수 없습니다 — 관리자에게 재등록을 요청하세요';
  end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'approved',
    approved_at = now(),
    approved_by = v_uid,
    approver_name = left(coalesce(v_profile.name, ''), 60),
    approver_title = v_profile.position,
    approver_stamp_path = v_profile.approval_stamp_path
  where id = p_id
  returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.approve_service_report(uuid) from public, anon;
grant execute on function public.approve_service_report(uuid) to authenticated;

-- D. complete_service_report
create or replace function public.complete_service_report(p_id uuid, p_tax_status text, p_tax_date date, p_memo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_open int;
begin
  if not public.has_permission(v_uid, 'service_reports.complete') then
    raise exception '서비스 리포트 완료 처리 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if p_tax_status is null or p_tax_status not in ('invoiced', 'not_required') then
    raise exception '세금계산서 상태는 invoiced|not_required 중 하나여야 합니다';
  end if;
  if p_tax_status = 'invoiced' and p_tax_date is null then raise exception '세금계산서 발행일이 필요합니다'; end if;
  if length(coalesce(p_memo, '')) > 500 then raise exception '메모는 500자 이내입니다'; end if;

  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
  if v_row.status <> 'approved' then raise exception '승인된 리포트만 완료 처리할 수 있습니다(현재: %)', v_row.status; end if;
  if v_row.pdf_url is null then raise exception '승인본 PDF가 아직 생성되지 않았습니다'; end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'completed', completed_at = now(), completed_by = v_uid,
    tax_invoice_status = p_tax_status,
    tax_invoice_date = case when p_tax_status = 'invoiced' then p_tax_date else null end,
    tax_invoice_memo = nullif(btrim(coalesce(p_memo, '')), '')
  where id = p_id
  returning * into v_row;

  -- 의뢰 done 조건(D-C13): draft·voided 제외 전 리포트 completed ∧ 후속 없음/처리됨. 이미 done/canceled면 no-op.
  if v_row.service_request_id is not null then
    perform 1 from public.service_requests where id = v_row.service_request_id for update;
    select count(*) into v_open from public.service_reports r
      where r.service_request_id = v_row.service_request_id
        and r.status not in ('draft', 'voided')
        and (r.status <> 'completed' or (r.follow_needed and r.follow_resolved_at is null));
    if v_open = 0 then
      update public.service_requests set status = 'done'
        where id = v_row.service_request_id and status not in ('done', 'canceled');
    end if;
  end if;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.complete_service_report(uuid, text, date, text) from public, anon;
grant execute on function public.complete_service_report(uuid, text, date, text) to authenticated;

-- E. void — issued|approved, completed 거부 메시지, child void 시 부모 reopen(다른 유효 child 없을 때)
create or replace function public.void_service_report(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not public.has_permission(v_uid, 'users.manage') then
    raise exception '리포트 무효화 권한이 없습니다(관리자 전용)' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception '무효화 사유가 필요합니다'; end if;
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if v_row.status = 'completed' then raise exception '완료된 리포트는 무효화할 수 없습니다'; end if;
  if v_row.status not in ('issued', 'approved') then raise exception '발행·승인된 리포트만 무효화할 수 있습니다'; end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports
    set status = 'voided', void_reason = left(btrim(p_reason), 500), voided_by = v_uid
    where id = p_id returning * into v_row;

  if v_row.parent_report_id is not null and not exists (
      select 1 from public.service_reports ch
      where ch.parent_report_id = v_row.parent_report_id and ch.id <> v_row.id and ch.status in ('issued', 'approved', 'completed')) then
    update public.service_reports set follow_resolved_at = null, follow_resolved_by = null
      where id = v_row.parent_report_id and status <> 'voided' and follow_needed;
  end if;
  return to_jsonb(v_row);
end; $$;

-- F. resolve_service_report_follow: `status = 'issued'` → `status in ('issued','approved','completed')` (그 외 20260716170100 본문 그대로)

-- G. get_service_report_pdf_status: 권한 검사 5키(write/view/view_all/approve/complete). 본문 20260720190000 그대로.
-- H. retry_service_report_pdf: 권한 (write|approve|complete|users.manage), `status in ('issued','approved')`, insert payload에 'revision', v_row.pdf_revision, 'expected_status', v_row.status. unique_violation은 '이미 생성 작업이 진행 중입니다'.

-- I. enqueue_service_report_email — 수동 고객 발송(UC1). 발신자 = 호출자(견적 enqueue_quote_email 동형).
create or replace function public.enqueue_service_report_email(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_hiworks text;
  v_log_id uuid;
begin
  if not (public.has_permission(v_uid, 'email.send') or public.has_permission(v_uid, 'users.manage')) then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if v_row.status not in ('approved', 'completed') then raise exception '승인된 리포트만 고객에게 발송할 수 있습니다(현재: %)', v_row.status; end if;
  if v_row.pdf_url is null then raise exception '승인본 PDF가 아직 생성되지 않았습니다'; end if;
  if v_row.recipient_email is null then raise exception '수신 이메일이 없습니다'; end if;
  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  if v_hiworks is null or btrim(v_hiworks) = '' then
    raise exception '발송자의 하이웍스 계정 ID가 설정되지 않았습니다 — 관리자에게 요청하세요';
  end if;
  begin
    insert into public.email_log (service_report_id, to_email, status, kind, from_user_id, hiworks_user_id)
    values (v_row.id, v_row.recipient_email, 'pending', 'customer', v_uid, v_hiworks)
    returning id into v_log_id;
  exception when unique_violation then
    raise exception '이미 발송 대기 중입니다';
  end;
  insert into public.jobs (type, payload)
  values ('service_report_email', jsonb_build_object('email_log_id', v_log_id, 'service_report_id', v_row.id, 'hiworks_user_id', v_hiworks));
  return jsonb_build_object('email_log_id', v_log_id, 'status', 'pending');
end; $$;
revoke all on function public.enqueue_service_report_email(uuid) from public, anon;
grant execute on function public.enqueue_service_report_email(uuid) to authenticated;

-- J. service_report_kpis — 5박스(D-B8). KST 월 앵커.
create or replace function public.service_report_kpis()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_month_start timestamptz := date_trunc('month', (now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
begin
  if not (public.has_permission(v_uid, 'service_reports.write') or public.has_permission(v_uid, 'service_reports.view')
          or public.has_permission(v_uid, 'service_reports.view_all') or public.has_permission(v_uid, 'service_reports.approve')
          or public.has_permission(v_uid, 'service_reports.complete')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'received', (select count(*) from public.service_requests where status in ('received', 'in_progress', 'on_hold')),
    'follow_open', (select count(*) from public.service_reports where status in ('issued', 'approved', 'completed') and follow_needed and follow_resolved_at is null),
    'awaiting_approval', (select count(*) from public.service_reports where status = 'issued'),
    'awaiting_tax', (select count(*) from public.service_reports where status = 'approved'),
    'completed_this_month', (select count(*) from public.service_reports where status = 'completed' and completed_at >= v_month_start)
  );
end; $$;
revoke all on function public.service_report_kpis() from public, anon;
grant execute on function public.service_report_kpis() to authenticated;

-- K. get_service_report_approval_notice — 알림 이력 요약(승인자 이메일 노출 없이 count/time만)
create or replace function public.get_service_report_approval_notice(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if not (v_row.created_by = v_uid
          or public.has_permission(v_uid, 'service_reports.view_all')
          or (v_row.status in ('issued', 'approved', 'completed', 'voided')
              and (public.has_permission(v_uid, 'service_reports.write') or public.has_permission(v_uid, 'service_reports.view')
                   or public.has_permission(v_uid, 'service_reports.approve') or public.has_permission(v_uid, 'service_reports.complete')))) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  return (select jsonb_build_object('sent_count', count(*) filter (where status = 'sent'), 'last_sent_at', max(sent_at))
            from public.email_log where service_report_id = p_id and kind = 'approval_notice');
end; $$;
revoke all on function public.get_service_report_approval_notice(uuid) from public, anon;
grant execute on function public.get_service_report_approval_notice(uuid) to authenticated;
```

롤백 `..170002_..._down.sql`: 신규 함수 5개 drop(`approve_service_report`, `complete_service_report`, `enqueue_service_report_email`, `service_report_kpis`, `get_service_report_approval_notice`), `issue/upsert`는 20260720170000 본문, `void/resolve`는 20260716170100 본문, `pdf_status`는 20260720190000, `retry`는 20260716200000 본문으로 복원(각 파일에서 그대로 복사).

- [ ] **Step 4: 통과 확인** — db reset → flow·notice·기존 service_reports·service_report_catalog_link·equipment_history 전부 PASS
- [ ] **Step 5: 커밋** — `feat(db): 서비스 리포트 승인·완료·수동 메일·KPI·알림 조회 RPC + issue 기사 서명·후속 부모 검증(#285 ③)`

---

### Task 6: 마이그 ④ 정책(RLS SELECT 4권한·email_log·스토리지·직인 버킷)

**Files:**
- Create: `supabase/migrations/20260909170003_service_report_approval_policies.sql`
- Create: `supabase/rollback/20260909170003_service_report_approval_policies_down.sql`
- Create: `packages/db-tests/src/service_report_approval_policies.test.ts`

**Interfaces:**
- Produces: `service_reports_select`(created_by | view_all | finalized 4상태 ∧ (write|view|approve|complete)), `email_log_select`(기존 3갈래 모두 `kind='customer'` 한정; 알림 행은 RPC로만), `service_reports_objects_read`(4상태 폴더 + 본인 draft; view_all 전체), INSERT/DELETE 정규식에 `engineer-signature.png`, 버킷 `approval-stamps`(비공개, 2MB, png/jpeg/webp) + users.manage 전용 4정책 + 경로 정규식.

- [ ] **Step 1: 실패 테스트**
```ts
describe("#285 정책", () => {
  test("approve만 가진 이사: issued/approved/completed/voided 보임, draft 안 보임", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); const d = await seed(); await toIssued(s.reportId); // d는 draft
      await asUser(c, DIR);
      const r = await c.query("select id, status from public.service_reports where id in ($1,$2)", [s.reportId, d.reportId]);
      expect(r.rows.map((x) => x.status)).toEqual(["issued"]);
    });
  });
  test("영업(view): approved·completed 리포트도 보인다(하드코딩 회귀)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, VIEW); const r = await c.query("select status from public.service_reports where id=$1", [s.reportId]);
      expect(r.rowCount).toBe(1);
    });
  });
  test("스토리지: complete 권한자는 발행 이후 폴더만, draft 사진·서명은 못 본다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); const d = await seed(); await toIssued(s.reportId);
      await asUser(c, MGMT);
      const r = await c.query("select name from storage.objects where bucket_id='service-reports' and name in ($1,$2)", [`${s.reportId}/signature.png`, `${d.reportId}/signature.png`]);
      expect(r.rows.map((x) => x.name)).toEqual([`${s.reportId}/signature.png`]);
    });
  });
  test("기사: 본인 draft 폴더에 engineer-signature.png 업로드·삭제 가능, 타인 폴더 불가", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); const other = "00000000-0000-0000-0000-0000000000f9";
      await asPostgres(c); await seedAuthUser(c, other, "ap-other@jhtech.test"); await c.query("update public.profiles set permissions='{service_reports.write}' where id=$1", [other]);
      await c.query("delete from storage.objects where name=$1", [`${s.reportId}/engineer-signature.png`]);
      await asUser(c, ENG); await c.query("insert into storage.objects (bucket_id, name, owner) values ('service-reports',$1,$2)", [`${s.reportId}/engineer-signature.png`, ENG]);
      await c.query("delete from storage.objects where name=$1", [`${s.reportId}/engineer-signature.png`]);
      await asUser(c, other); await expectReject(() => c.query("insert into storage.objects (bucket_id, name, owner) values ('service-reports',$1,$2)", [`${s.reportId}/engineer-signature.png`, other]), /row-level security/);
    });
  });
  test("approval-stamps: 관리자만 읽기/쓰기, 경로 정규식, 일반 사용자·anon 차단", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      await c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp-1757400001.png`, UID.admin]);
      await expectReject(() => c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp.png`, UID.admin]), /row-level security/);
      await asUser(c, DIR); const r = await c.query("select count(*)::int n from storage.objects where bucket_id='approval-stamps'"); expect(r.rows[0].n).toBe(0);
      await asUser(c, VIEW); await expectReject(() => c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp-1757400002.png`, VIEW]), /row-level security/);
    });
  });
  test("email_log: 알림 행(kind=approval_notice)은 일반 SELECT에서 보이지 않는다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await asPostgres(c);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'dir@x.y','sent','approval_notice')", [s.reportId]);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'cust@x.y','sent','customer')", [s.reportId]);
      await asUser(c, MGMT); const r = await c.query("select kind from public.email_log where service_report_id=$1", [s.reportId]);
      expect(r.rows.map((x) => x.kind)).toEqual(["customer"]);
    });
  });
});
```
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 마이그 작성**
```sql
-- #285 ④ 정책. 권한 키 동기화 9곳 중 DB 3곳(테이블 RLS·email_log·스토리지) + 직인 버킷.
-- 1. service_reports SELECT — 4권한 × 발행 이후 4상태
drop policy if exists service_reports_select on public.service_reports;
create policy service_reports_select on public.service_reports
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
    or (
      status in ('issued', 'approved', 'completed', 'voided')
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view'))
           or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
           or (select public.has_permission((select auth.uid()), 'service_reports.complete')))
    )
  );
-- 2. email_log SELECT — 알림 행(kind=approval_notice, 승인자 개인 메일)은 일반 조회에서 제외
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated using (
    kind = 'customer' and (
      (select public.has_permission((select auth.uid()), 'applications.view_all'))
      or (select public.has_permission((select auth.uid()), 'email.send'))
      or (service_report_id is not null
          and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
               or (select public.has_permission((select auth.uid()), 'service_reports.view'))
               or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
               or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
               or (select public.has_permission((select auth.uid()), 'service_reports.complete'))))
    )
  );
-- 3. 스토리지 service-reports read — 폴더의 리포트 상태로 판정(D-C10)
drop policy if exists service_reports_objects_read on storage.objects;
create policy service_reports_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'service-reports'
    and (
      (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
      or exists (
        select 1 from public.service_reports r
        where r.id = split_part(name, '/', 1)::uuid
          and ( r.created_by = (select auth.uid())
                or ( r.status in ('issued', 'approved', 'completed', 'voided')
                     and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
                          or (select public.has_permission((select auth.uid()), 'service_reports.view'))
                          or (select public.has_permission((select auth.uid()), 'service_reports.approve'))
                          or (select public.has_permission((select auth.uid()), 'service_reports.complete'))) ) )
      )
    )
  );
-- 4. INSERT/DELETE — 기사 서명 파일 허용(본인 draft 폴더 조건 그대로)
drop policy if exists service_reports_objects_insert on storage.objects;
create policy service_reports_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'service-reports'
    and (
      name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(before|after)-[1-6]\.(jpg|jpeg|png|webp)$'
      or name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(signature|engineer-signature)\.png$'
    )
    and exists (select 1 from public.service_reports r where r.id = split_part(name, '/', 1)::uuid and r.created_by = (select auth.uid()) and r.status = 'draft')
    and (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );
-- (DELETE 정책은 경로 무관 본인 draft 폴더 조건이라 변경 불필요)
-- 5. 직인 버킷 — 비공개, users.manage 전용, 버전 파일명 강제(덮어쓰기 없음)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('approval-stamps', 'approval-stamps', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy approval_stamps_read on storage.objects for select to authenticated
  using (bucket_id = 'approval-stamps' and (select public.has_permission((select auth.uid()), 'users.manage')));
create policy approval_stamps_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'approval-stamps'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/stamp-[0-9]+\.(png|jpg|jpeg|webp)$'
    and (select public.has_permission((select auth.uid()), 'users.manage')));
create policy approval_stamps_delete on storage.objects for delete to authenticated
  using (bucket_id = 'approval-stamps' and (select public.has_permission((select auth.uid()), 'users.manage')));
-- UPDATE 정책 없음(의도: 덮어쓰기 금지 — 승인본 스냅샷 불변)
```
롤백: 정책 4개 drop 후 20260720190000 ①②③ + 20260716170000 INSERT 정책 복원, `approval_stamps_*` drop, 버킷은 유지(객체 있으면 삭제 실패) 주석.

- [ ] **Step 4: 통과 확인** — db reset → policies + view_permission + customer_uploads 등 전체 db-tests PASS
- [ ] **Step 5: 커밋** — `feat(db): 서비스 리포트 RLS 4권한·스토리지 상태 스코프·직인 버킷·email_log 알림 격리(#285 ④)`

---

### Task 7: 웹 타입·상수 동기화 + e2e skip + 롤백 리허설

**Files:**
- Create: `apps/web/src/lib/service-reports/status.ts` — `export { SERVICE_REPORT_STATUSES, SERVICE_REPORT_FINALIZED, SERVICE_REPORT_MAILABLE, SERVICE_REPORT_STATUS_LABEL, canTransition } from "@jhtechsaas/shared"; export type { ServiceReportStatus } from "@jhtechsaas/shared";`
- Modify: `apps/web/src/lib/service-reports/types.ts:7`, `admin-actions.ts:13` → `status: ServiceReportStatus`; `equipment-history.ts:22` `.in("status", ["issued","voided"])` → `[...SERVICE_REPORT_FINALIZED, "voided"]`, `:44` `.eq("status","issued")` → `.in("status", SERVICE_REPORT_FINALIZED)`; `actions.ts:86` 동일.
- Modify: `apps/web/e2e/field-service-report.spec.ts` — 파일 상단 `test.skip(true, "#285 PR #B'(기사 서명 UI) 전까지 issue RPC가 기사 서명을 요구 — #B'에서 복원");`
- Test: `apps/web/src/lib/service-reports/status.test.ts` — 재export 계약(`SERVICE_REPORT_STATUS_LABEL.approved === "세금계산서 미발행"`).

- [ ] **Step 1: 실패 테스트** 작성 → **Step 2** FAIL → **Step 3** 구현 → **Step 4** `pnpm --filter web test`·`typecheck`·`lint` PASS, `pnpm --filter worker exec tsc --noEmit` PASS(워커는 무변경)
- [ ] **Step 5: 롤백 리허설** — `supabase db reset` → `psql "$DB_URL" -f supabase/rollback/20260909170003_*_down.sql` → `..170002` → `..170001` → `..170000` 순 실행 오류 0 → `supabase db reset`(up 재적용) → db-tests PASS. 결과를 PR 본문에 기록.
- [ ] **Step 6: 커밋** — `feat(web): 서비스 리포트 상태 5종 타입·FINALIZED 치환 + field e2e 임시 skip(#285 #A)`

---

### Task 8: 전체 게이트 + PR

- [ ] `pnpm --filter @jhtechsaas/shared test` · `pnpm --filter web test` · `pnpm --filter web typecheck` · `pnpm --filter worker exec tsc --noEmit` · `pnpm -r lint` · `pnpm -r build` · `supabase db reset` → `pnpm --filter @jhtechsaas/db-tests test:rls` (전체) · `grep -rn "as any" apps/web/src apps/worker/src packages/shared/src packages/db-tests/src | wc -l` = 0
- [ ] `bash supabase/seed/seed-local.sh` → `pnpm --filter web test:e2e` (field spec skip 외 GREEN)
- [ ] PR 생성(`/ship`): 제목 `feat(db): 서비스 리포트 결재 흐름 ① DB·권한·상태기계·알림 트리거 (#285 #A)`. 본문: 변경 요약·**prod 적용은 #A~#C 배치(워커→db push→Vercel)**·field e2e skip 사유·롤백 리허설 결과·db-tests 건수.

---

## Self-Review

- **Spec coverage**: D-A1(approve pdf_url)·A2/D-C13(done 조건)·A3/D-C12(직인 실존·스냅샷)·A5(invoiced)·D-C1/C8(잡 유니크·revision payload)·C9(쌍별 동결)·C10/C11(스토리지)·C14(후속 불변식·reopen)·C15(롤백 구조)·C16(email index)·C17(RLS 9곳 중 DB 3곳 + 웹 guard/console/layout)·C18(FK no action + delete-blockers)·C20(발신자 호출자)·C21(upsert null)·C22~C27(알림 트리거·run_after·claim 최신판·email_log kind/RLS·알림 조회 RPC)·D-C4(하드코딩 DB 2곳: resolve_follow·follow_open 인덱스 + 웹 lib 3곳) → 전부 태스크 있음. `ReportTable.tsx:34,167`·워커 pdf.ts 가드는 #B/#C 범위(계획 명시).
- **Placeholder scan**: "20260720170000 본문 + 변경"은 실제 파일에서 복사 지시(구체 diff 명시) — 허용. 나머지 코드 블록 완전.
- **Type consistency**: `SERVICE_REPORT_FINALIZED`·`canTransition`·`TAX_INVOICE_STATUSES` 이름 Task 1↔7 일치. RPC 시그니처 Task 5↔테스트 일치(`complete_service_report(uuid,text,date,text)`).
