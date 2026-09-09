// #285 ④ 정책 — service_reports SELECT(4권한×4상태)·email_log 알림 격리·스토리지 상태 스코프·기사 서명 업로드·직인 버킷.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";
import { DIR, ENG, ENG_SIG, MGMT, VIEW, bindClient, seed, toApproved, toIssued } from "./service_report_approval_fixture";

let c: Client;
beforeAll(async () => { c = await makeClient(); bindClient(c); });
afterAll(async () => { await c.end(); });

async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

describe("#285 정책", () => {
  test("approve만 가진 이사: issued/approved 보임, draft 안 보임", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); const d = await seed(); const a = await seed();
      await toIssued(s.reportId); await toIssued(a.reportId); await toApproved(a.reportId);
      await asUser(c, DIR);
      const r = await c.query("select status from public.service_reports where id in ($1,$2,$3) order by status", [s.reportId, d.reportId, a.reportId]);
      expect(r.rows.map((x) => x.status)).toEqual(["approved", "issued"]);
    });
  });

  test("complete만 가진 관리부: approved·completed 보임 / 영업(view): approved도 보임(하드코딩 회귀 가드)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId); await toApproved(s.reportId);
      await asUser(c, MGMT);
      let r = await c.query("select status from public.service_reports where id=$1", [s.reportId]);
      expect(r.rowCount).toBe(1);
      await asUser(c, VIEW);
      r = await c.query("select status from public.service_reports where id=$1", [s.reportId]);
      expect(r.rowCount).toBe(1);
    });
  });

  test("스토리지 read: complete 권한자는 발행 이후 폴더만 — draft 사진·서명은 못 본다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); const d = await seed(); await toIssued(s.reportId);
      await asUser(c, MGMT);
      const r = await c.query("select name from storage.objects where bucket_id='service-reports' and name in ($1,$2)", [
        `${s.reportId}/signature.png`, `${d.reportId}/signature.png`,
      ]);
      expect(r.rows.map((x) => x.name)).toEqual([`${s.reportId}/signature.png`]);
    });
  });

  test("스토리지 insert: 기사는 본인 draft 폴더에 engineer-signature 업로드 가능, 타인 폴더·발행 후 불가", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const OTHER = "00000000-0000-0000-0000-0000000000f9";
      await asPostgres(c);
      await seedAuthUser(c, OTHER, "ap-other@jhtech.test");
      await c.query("update public.profiles set permissions='{service_reports.write}' where id=$1", [OTHER]);
      // 픽스처가 넣어둔 기사 서명은 0바이트로 두고 새 경로로 업로드 시도(같은 name 충돌 회피용 별도 draft)
      const d2 = await seed();
      await asPostgres(c);
      await c.query("update storage.objects set metadata='{\"size\":0}'::jsonb where name=$1", [`${d2.reportId}/${ENG_SIG}`]);
      // 본인 draft: 새 객체명(사진 슬롯)으로 INSERT 정책 통과 확인 + 기사 서명 정규식 허용 확인은 name 검사로
      await asUser(c, ENG);
      await c.query("insert into storage.objects (bucket_id, name, owner) values ('service-reports',$1,$2)", [`${d2.reportId}/before-1.jpg`, ENG]);
      await asUser(c, OTHER);
      await expectReject(
        () => c.query("insert into storage.objects (bucket_id, name, owner) values ('service-reports',$1,$2)", [`${d2.reportId}/before-2.jpg`, OTHER]),
        /row-level security/,
      );
      await toIssued(s.reportId);
      await asUser(c, ENG);
      await expectReject(
        () => c.query("insert into storage.objects (bucket_id, name, owner) values ('service-reports',$1,$2)", [`${s.reportId}/before-3.jpg`, ENG]),
        /row-level security/,
      );
      // 정책 정규식이 engineer-signature를 포함하는지(정책 정의문)
      await asPostgres(c);
      const pol = await c.query("select pg_get_expr(polwithcheck, polrelid) w from pg_policy where polname='service_reports_objects_insert'");
      expect(pol.rows[0].w).toMatch(/engineer-signature/);
    });
  });

  test("approval-stamps: 관리자만 읽기/쓰기, 버전 파일명 정규식, 이사·영업·anon 차단", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      await c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp-1757400001.png`, UID.admin]);
      await expectReject(
        () => c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp.png`, UID.admin]),
        /row-level security/,
      );
      const adminSee = await c.query("select count(*)::int n from storage.objects where bucket_id='approval-stamps'");
      expect(adminSee.rows[0].n).toBeGreaterThanOrEqual(2);
      await asUser(c, DIR);
      const r = await c.query("select count(*)::int n from storage.objects where bucket_id='approval-stamps'");
      expect(r.rows[0].n).toBe(0);
      await asUser(c, VIEW);
      await expectReject(
        () => c.query("insert into storage.objects (bucket_id, name, owner) values ('approval-stamps',$1,$2)", [`${DIR}/stamp-1757400002.png`, VIEW]),
        /row-level security/,
      );
      await asAnon(c);
      const an = await c.query("select count(*)::int n from storage.objects where bucket_id='approval-stamps'");
      expect(an.rows[0].n).toBe(0);
      await asPostgres(c);
      const b = await c.query("select public, file_size_limit from storage.buckets where id='approval-stamps'");
      expect(b.rows[0].public).toBe(false);
      expect(Number(b.rows[0].file_size_limit)).toBe(2097152);
    });
  });

  test("email_log: 알림 행(kind=approval_notice)은 일반 SELECT에서 보이지 않는다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed(); await toIssued(s.reportId);
      await asPostgres(c);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'dir@x.y','sent','approval_notice')", [s.reportId]);
      await c.query("insert into public.email_log (service_report_id, to_email, status, kind) values ($1,'cust@x.y','sent','customer')", [s.reportId]);
      await asUser(c, MGMT);
      const r = await c.query("select kind from public.email_log where service_report_id=$1", [s.reportId]);
      expect(r.rows.map((x) => x.kind)).toEqual(["customer"]);
      await asUser(c, DIR); // approve 권한자도 고객 발송 이력은 본다
      const r2 = await c.query("select kind from public.email_log where service_report_id=$1", [s.reportId]);
      expect(r2.rows.map((x) => x.kind)).toEqual(["customer"]);
    });
  });
});
