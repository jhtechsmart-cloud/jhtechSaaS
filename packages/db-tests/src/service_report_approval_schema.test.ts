// #285 ① 스키마 — 상태 5종 CHECK·세금계산서 값·email_log 재발송 인덱스(kind)·jobs run_after/유니크·직인 경로 CHECK.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, inRollbackTx, makeClient, seedAuthUser } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// tx 내 거부 단언 — 실패 쿼리는 tx를 abort시키므로 savepoint로 감싼다(기존 패턴).
async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

const SR_ID = "11111111-1111-1111-1111-111111111111";
const USER = "00000000-0000-0000-0000-0000000000c1";

async function draftReport(): Promise<string> {
  await seedAuthUser(c, USER, "schema-user@jhtech.test");
  const co = await c.query("insert into public.companies (name) values ('스키마상사') returning id");
  const rp = await c.query(
    `insert into public.service_reports (company_id, customer_name, device_name, faults, diagnosis, action_text, created_by)
     values ($1,'스키마상사','장비','{a}','d','a',$2) returning id`,
    [co.rows[0].id, USER],
  );
  return rp.rows[0].id as string;
}

describe("#285 스키마", () => {
  test("status CHECK가 approved/completed를 허용한다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "select pg_get_constraintdef(oid) d from pg_constraint where conname='service_reports_status_check'",
      );
      expect(r.rows[0].d).toMatch(/approved/);
      expect(r.rows[0].d).toMatch(/completed/);
    });
  });

  test("tax_invoice_status는 invoiced|not_required만(리포트 issued와 혼동 차단)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const id = await draftReport();
      await expectReject(
        () => c.query("update public.service_reports set tax_invoice_status='issued' where id=$1", [id]),
        /tax_invoice_status/,
      );
      await c.query("update public.service_reports set tax_invoice_status='not_required' where id=$1", [id]);
    });
  });

  test("email_log 활성 유니크 = pending·sending·customer만: sent 후 재발송 가능, 알림 행은 다건 허용", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const id = await draftReport();
      await c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','sent')", [id]);
      // sent 후 재발송 행 OK(견적 20260617120000 동형)
      await c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','pending')", [id]);
      await expectReject(
        () => c.query("insert into public.email_log (service_report_id, to_email, status) values ($1,'a@b.c','pending')", [id]),
        /duplicate key/,
      );
      // 승인 알림(kind=approval_notice)은 수신자 다수 — 유니크 대상 아님
      await c.query(
        "insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'x@y.z','pending','approval_notice')",
        [id],
      );
      await c.query(
        "insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'x2@y.z','pending','approval_notice')",
        [id],
      );
      await expectReject(
        () => c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'q@y.z','pending','bogus')", [id]),
        /email_log_kind_check/,
      );
    });
  });

  test("claim_next_job: run_after 미도래 잡은 건너뛰고 도래 잡만 집는다(스테일 회수 로직 유지)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query("delete from public.jobs"); // 격리(트랜잭션 내)
      await c.query("insert into public.jobs (type, payload, run_after) values ('t_future','{}', now() + interval '1 day')");
      const due = await c.query(
        "insert into public.jobs (type, payload, run_after) values ('t_due','{}', now() - interval '1 minute') returning id",
      );
      await asService(c);
      const j = await c.query("select public.claim_next_job() as j");
      expect(j.rows[0].j.id).toBe(due.rows[0].id);
      const j2 = await c.query("select public.claim_next_job() as j");
      expect(j2.rows[0].j).toBeNull();
      await asPostgres(c);
      const def = await c.query("select pg_get_functiondef('public.claim_next_job()'::regprocedure) d");
      expect(def.rows[0].d).toMatch(/interval '5 minutes'/); // 20260611120000 스테일 회수 보존
      expect(def.rows[0].d).toMatch(/run_after/);
    });
  });

  test("PDF 잡은 리포트당 queued 1건, 알림 잡은 리포트·kind별 활성 1건", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const pdf = (id: string) =>
        c.query("insert into public.jobs (type, payload) values ('service_report_pdf', jsonb_build_object('service_report_id', $1::text))", [id]);
      await pdf(SR_ID);
      await expectReject(() => pdf(SR_ID), /duplicate key/);
      const notice = (kind: string) =>
        c.query(
          "insert into public.jobs (type, payload) values ('service_report_approval_notice', jsonb_build_object('service_report_id', $1::text, 'kind', $2::text))",
          [SR_ID, kind],
        );
      await notice("initial");
      await notice("reminder");
      await expectReject(() => notice("initial"), /duplicate key/);
    });
  });

  test("profiles.approval_stamp_path는 <uid>/stamp-<epoch>.<ext> 버전 경로만", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, USER, "schema-user@jhtech.test");
      await expectReject(
        () => c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [USER, `${USER}/stamp.png`]),
        /approval_stamp_path/,
      );
      await c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [USER, `${USER}/stamp-1757400000.png`]);
    });
  });

  test("engineer_signature_path는 <id>/engineer-signature.png만", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const id = await draftReport();
      await expectReject(
        () => c.query("update public.service_reports set engineer_signature_path=$2 where id=$1", [id, `${id}/signature.png`]),
        /engineer_sig_path/,
      );
      await c.query("update public.service_reports set engineer_signature_path=$2 where id=$1", [id, `${id}/engineer-signature.png`]);
    });
  });
});
