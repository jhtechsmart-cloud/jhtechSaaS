// #285 ③ — RPC(issue 재정의/approve/complete/void/resolve/retry·pdf_status/upsert·후속 리포트).
// 픽스처·전이 헬퍼는 flow 테스트 파일에서 공유(같은 사용자 4명·같은 규칙).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, UID } from "./helpers";
import { DIR, ENG, ENG_SIG, MGMT, STAMP, VIEW, bindClient, seed, setPdf, toApproved, toCompleted, toIssued } from "./service_report_approval_fixture";

let c: Client;
beforeAll(async () => { c = await makeClient(); bindClient(c); });
afterAll(async () => { await c.end(); });


async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

describe("#285 RPC — issue/approve/complete/void/resolve/후속", () => {
  test("issue: 기사 서명 없으면 거부, 객체 없으면 거부, 있으면 통과 + 의뢰 in_progress", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      await c.query("update public.service_reports set engineer_signature_path=null where id=$1", [s.reportId]);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [s.reportId]), /기사 서명이 필요/);
      await asPostgres(c);
      // storage.objects는 직접 delete가 막혀 있어(Storage API 전용) 0바이트로 만들어 "업로드 실패"를 재현
      await c.query("update storage.objects set metadata='{\"size\":0}'::jsonb where name=$1", [`${s.reportId}/${ENG_SIG}`]);
      await c.query("update public.service_reports set engineer_signature_path=$2 where id=$1", [s.reportId, `${s.reportId}/${ENG_SIG}`]);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [s.reportId]), /기사 서명 파일이 업로드되지 않았/);
      await asPostgres(c);
      await c.query("update storage.objects set metadata='{\"size\":1024}'::jsonb where name=$1", [`${s.reportId}/${ENG_SIG}`]);
      await asUser(c, ENG);
      const r = await c.query("select public.issue_service_report($1) as r", [s.reportId]);
      expect(r.rows[0].r.status).toBe("issued");
      await asPostgres(c);
      const rq = await c.query("select status from public.service_requests where id=$1", [s.requestId]);
      expect(rq.rows[0].status).toBe("in_progress");
    });
  });

  test("approve: 권한/pdf_url/직인 미등록/직인 파일 없음 거부 → 정상 시 스냅샷·pdf_url null·revision 2 → 재승인 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asUser(c, VIEW);
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /권한/);
      await asUser(c, DIR);
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /PDF/);
      await setPdf(s.reportId, 1);
      await asPostgres(c); await c.query("update public.profiles set approval_stamp_path=null where id=$1", [DIR]);
      await asUser(c, DIR);
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /직인이 등록되지/);
      await asPostgres(c);
      await c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [DIR, `${DIR}/stamp-1757400099.png`]); // 파일 없는 경로
      await asUser(c, DIR);
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /직인 파일을 찾을 수 없/);
      await asPostgres(c);
      await c.query("update public.profiles set approval_stamp_path=$2 where id=$1", [DIR, STAMP]);
      await asUser(c, DIR);
      const r = await c.query("select public.approve_service_report($1) as r", [s.reportId]);
      expect(r.rows[0].r).toMatchObject({
        status: "approved", approver_name: "배이사", approver_title: "영업부 이사", approved_by: DIR,
        pdf_url: null, pdf_revision: 2, approver_stamp_path: STAMP,
      });
      await expectReject(() => c.query("select public.approve_service_report($1)", [s.reportId]), /승인 대기 상태가 아닙니다/);
    });
  });

  test("complete: 상태/pdf_url/tax 값/invoiced 날짜/권한 거부 → 정상 + 의뢰 done", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await setPdf(s.reportId, 1);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]), /승인된 리포트만/);
      await toApproved(s.reportId);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]), /PDF/);
      await setPdf(s.reportId, 2);
      await asUser(c, MGMT);
      await expectReject(() => c.query("select public.complete_service_report($1,'issued',null,null)", [s.reportId]), /세금계산서 상태/);
      await expectReject(() => c.query("select public.complete_service_report($1,'invoiced',null,null)", [s.reportId]), /발행일/);
      await asUser(c, VIEW);
      await expectReject(() => c.query("select public.complete_service_report($1,'not_required',null,null)", [s.reportId]), /권한/);
      await asUser(c, MGMT);
      const r = await c.query("select public.complete_service_report($1,'invoiced','2026-09-30','9월 합산') as r", [s.reportId]);
      expect(r.rows[0].r).toMatchObject({ status: "completed", tax_invoice_status: "invoiced", tax_invoice_memo: "9월 합산", completed_by: MGMT });
      await asPostgres(c);
      const rq = await c.query("select status from public.service_requests where id=$1", [s.requestId]);
      expect(rq.rows[0].status).toBe("done");
    });
  });

  test("의뢰 done 조건: 후속 미처리면 in_progress 유지 / 버려진 draft가 있어도 done", async () => {
    await inRollbackTx(c, async () => {
      const a = await seed({ follow: true }); await toIssued(a.reportId); await setPdf(a.reportId, 1);
      await toApproved(a.reportId); await setPdf(a.reportId, 2);
      await asPostgres(c);
      await c.query("update public.service_requests set status='in_progress' where id=$1", [a.requestId]);
      await asUser(c, MGMT);
      await c.query("select public.complete_service_report($1,'not_required',null,null)", [a.reportId]);
      await asPostgres(c);
      let rq = await c.query("select status from public.service_requests where id=$1", [a.requestId]);
      expect(rq.rows[0].status).toBe("in_progress");

      const b = await seed(); await toIssued(b.reportId); await setPdf(b.reportId, 1);
      await toApproved(b.reportId); await setPdf(b.reportId, 2);
      await asPostgres(c);
      await c.query(
        "insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, created_by) values ($1,$2,'결재상사','장비','{a}','d','a',$3)",
        [b.requestId, b.companyId, ENG],
      );
      await asUser(c, MGMT);
      await c.query("select public.complete_service_report($1,'not_required',null,null)", [b.reportId]);
      await asPostgres(c);
      rq = await c.query("select status from public.service_requests where id=$1", [b.requestId]);
      expect(rq.rows[0].status).toBe("done");
    });
  });

  test("void: approved 허용, completed 거부, 관리자 전용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, DIR);
      await expectReject(() => c.query("select public.void_service_report($1,'x')", [s.reportId]), /권한/);
      await asUser(c, UID.admin);
      const r = await c.query("select public.void_service_report($1,'오발행') as r", [s.reportId]);
      expect(r.rows[0].r.status).toBe("voided");
      const s2 = await seed(); await toIssued(s2.reportId); await toApproved(s2.reportId); await toCompleted(s2.reportId);
      await asUser(c, UID.admin);
      await expectReject(() => c.query("select public.void_service_report($1,'x')", [s2.reportId]), /완료된 리포트는 무효화할 수 없습니다/);
    });
  });

  test("resolve_follow: approved 리포트도 처리 가능", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed({ follow: true }); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, ENG);
      const r = await c.query("select public.resolve_service_report_follow($1) as r", [s.reportId]);
      expect(r.rows[0].r.follow_resolved_by).toBe(ENG);
    });
  });

  test("retry/pdf_status: approved(pdf_url null)에서 승인 권한자가 재시도 가능 + payload 세대·expected_status", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await setPdf(s.reportId, 1); await toApproved(s.reportId);
      await asPostgres(c);
      await c.query("update public.jobs set status='failed' where type='service_report_pdf' and payload->>'service_report_id'=$1", [s.reportId]);
      await asUser(c, DIR);
      const st = await c.query("select public.get_service_report_pdf_status($1) as s", [s.reportId]);
      expect(st.rows[0].s.state).toBe("failed");
      const r = await c.query("select public.retry_service_report_pdf($1) as r", [s.reportId]);
      expect(r.rows[0].r.state).toBe("processing");
      await asPostgres(c);
      const j = await c.query("select payload from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1 and status='queued'", [s.reportId]);
      expect(j.rows[0].payload).toMatchObject({ revision: 2, expected_status: "approved" });
    });
  });

  test("후속 리포트: 부모 규칙 거부 3종 + 정상 확정 시 부모 follow_resolved + child void 시 부모 reopen", async () => {
    await inRollbackTx(c, async () => {
      const p = await seed({ follow: true }); await toIssued(p.reportId);
      const mk = async (parent: string, reqId: string, compId: string): Promise<string> => {
        await asPostgres(c);
        const r = await c.query(
          `insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text,
              charge_type, visit_fee, parent_report_id, created_by)
           values ($1,$2,'결재상사','JU-2513UV','{접촉불량}','진단','조치','paid',10000,$3,$4) returning id`,
          [reqId, compId, parent, ENG],
        );
        const id = r.rows[0].id as string;
        for (const n of ["signature.png", ENG_SIG]) {
          await c.query("insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{\"size\":1024}'::jsonb)", [`${id}/${n}`]);
        }
        await c.query("update public.service_reports set signature_path=$2, engineer_signature_path=$3 where id=$1", [id, `${id}/signature.png`, `${id}/${ENG_SIG}`]);
        return id;
      };
      const other = await seed(); await toIssued(other.reportId);
      const bad1 = await mk(other.reportId, p.requestId, p.companyId);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [bad1]), /같은 의뢰/);
      await asPostgres(c);
      const dp = await c.query(
        "insert into public.service_reports (service_request_id, company_id, customer_name, device_name, faults, diagnosis, action_text, created_by) values ($1,$2,'결재상사','장비','{a}','d','a',$3) returning id",
        [p.requestId, p.companyId, ENG],
      );
      const bad2 = await mk(dp.rows[0].id, p.requestId, p.companyId);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [bad2]), /확정 전/);
      const child = await mk(p.reportId, p.requestId, p.companyId);
      await asUser(c, ENG);
      await c.query("select public.issue_service_report($1)", [child]);
      await asPostgres(c);
      let pr = await c.query("select follow_resolved_at, follow_resolved_by from public.service_reports where id=$1", [p.reportId]);
      expect(pr.rows[0].follow_resolved_at).not.toBeNull();
      expect(pr.rows[0].follow_resolved_by).toBe(ENG);
      const bad3 = await mk(child, p.requestId, p.companyId);
      await asUser(c, ENG);
      await expectReject(() => c.query("select public.issue_service_report($1)", [bad3]), /1단/);
      await asUser(c, UID.admin);
      await c.query("select public.void_service_report($1,'재작성')", [child]);
      await asPostgres(c);
      pr = await c.query("select follow_resolved_at from public.service_reports where id=$1", [p.reportId]);
      expect(pr.rows[0].follow_resolved_at).toBeNull();
    });
  });

  test("upsert: engineer_signature_path 경로 검증(타 폴더 거부·빈 값 null) + parent_report_id 저장", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const base = {
        company_id: s.companyId, service_request_id: s.requestId, faults: ["접촉불량"], diagnosis: "d", action_text: "a",
        charge_type: "paid", visit_fee: 1000, device_name: "JU-2513UV", customer_name: "결재상사",
      };
      await asUser(c, ENG);
      await expectReject(
        () => c.query("select public.upsert_service_report($1,$2::jsonb)", [s.reportId, JSON.stringify({ ...base, engineer_signature_path: `0000/${ENG_SIG}` })]),
        /기사 서명 경로/,
      );
      const r = await c.query("select public.upsert_service_report($1,$2::jsonb) as r", [
        s.reportId, JSON.stringify({ ...base, engineer_signature_path: "", signature_path: "", parent_report_id: "" }),
      ]);
      expect(r.rows[0].r.engineer_signature_path).toBeNull();
      expect(r.rows[0].r.parent_report_id).toBeNull();
      const parent = await seed(); await toIssued(parent.reportId);
      await asUser(c, ENG);
      const r2 = await c.query("select public.upsert_service_report($1,$2::jsonb) as r", [
        s.reportId, JSON.stringify({ ...base, engineer_signature_path: `${s.reportId}/${ENG_SIG}`, parent_report_id: parent.reportId }),
      ]);
      expect(r2.rows[0].r.parent_report_id).toBe(parent.reportId);
      expect(r2.rows[0].r.engineer_signature_path).toBe(`${s.reportId}/${ENG_SIG}`);
    });
  });
});
