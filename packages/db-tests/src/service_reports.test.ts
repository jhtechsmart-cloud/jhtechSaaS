// #228 Part 1 — service_reports RLS·트리거·RPC 통합 테스트.
// 채번(SR-)·draft 강제·발행 동결·FOR UPDATE 확정·서명 실존 검증·신청 전이·신규 고객/장비 생성·
// 금액 서버 재계산·email enqueue 멱등·voided·storage 소유 정책.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const ENG1 = "00000000-0000-0000-0000-0000000000e1";
const ENG2 = "00000000-0000-0000-0000-0000000000e2";


// tx 내 거부 단언 — 실패 쿼리는 tx를 abort시키므로 savepoint로 감싼다(기존 패턴).
async function expectReject(fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint sp");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

interface Seeded { companyId: string; equipmentId: string; requestId: string }

async function seed(): Promise<Seeded> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "srp-admin@jhtech.test");
  await seedAuthUser(c, ENG1, "srp-eng1@jhtech.test");
  await seedAuthUser(c, ENG2, "srp-eng2@jhtech.test");
  await seedAuthUser(c, UID.sales1, "srp-sales@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query(
    "update public.profiles set permissions='{service_reports.write}', name='홍기사', position='기술팀 과장', hiworks_user_id='eng1' where id=$1",
    [ENG1],
  );
  await c.query("update public.profiles set permissions='{service_reports.write}' where id=$1", [ENG2]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales1]);
  const co = await c.query(
    "insert into public.companies (name, biz_no, phone, email) values ('리포트상사','3334445551','02-000-0000','cust@jhtech.test') returning id",
  );
  const companyId = co.rows[0].id as string;
  const eq = await c.query(
    "insert into public.company_equipment (company_id, label, serial_no, purchased_at) values ($1,'JU-2513UV','SN-1','2025-10-01') returning id",
    [companyId],
  );
  const rq = await c.query(
    `insert into public.service_requests
       (biz_no, company_id, company_equipment_id, contact_company, status,
        privacy_consent, privacy_consent_at, privacy_consent_version, fields)
     values ('3334445551',$1,$2,'리포트상사','received', true, now(), 'v1.1', '{"symptom":"출력 안 됨"}'::jsonb)
     returning id`,
    [companyId, eq.rows[0].id],
  );
  return { companyId, equipmentId: eq.rows[0].id as string, requestId: rq.rows[0].id as string };
}

// eng1이 draft 생성(RPC) 후 리포트 행 반환.
async function createDraft(s: Seeded, over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  await asUser(c, ENG1);
  const payload = {
    company_id: s.companyId,
    company_equipment_id: s.equipmentId,
    service_request_id: s.requestId,
    faults: ["접촉불량", "SSR·퓨즈 불량"],
    diagnosis: "SSR 접촉부 접촉불량 확인",
    action_text: "재납땜 후 출력 정상",
    charge_type: "paid",
    visit_fee: 90000,
    overtime_fee: 0,
    parts: [{ name: "SSR 모듈", qty: 2, price: 15000 }],
    ...over,
  };
  const r = await c.query("select public.upsert_service_report(null, $1::jsonb) as row", [JSON.stringify(payload)]);
  return r.rows[0].row as Record<string, unknown>;
}

// 서명 객체 fake 업로드(postgres 직삽) + draft에 서명 경로 반영.
async function attachSignature(reportId: string, payloadOver: Record<string, unknown>, s: Seeded): Promise<void> {
  await asPostgres(c);
  await c.query(
    `insert into storage.objects (bucket_id, name, metadata) values ('service-reports', $1, '{"size": 2048}'::jsonb)`,
    [`${reportId}/signature.png`],
  );
  await asUser(c, ENG1);
  const payload = {
    company_id: s.companyId,
    company_equipment_id: s.equipmentId,
    service_request_id: s.requestId,
    faults: ["접촉불량"],
    diagnosis: "진단",
    action_text: "조치",
    charge_type: "paid",
    visit_fee: 90000,
    signature_path: `${reportId}/signature.png`,
    ...payloadOver,
  };
  await c.query("select public.upsert_service_report($1, $2::jsonb)", [reportId, JSON.stringify(payload)]);
}

describe("service_reports — 권한·채번·서버값 강제", () => {
  test("service_reports.write 없는 계정은 upsert RPC 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, UID.sales1);
      await expectReject(() => c.query("select public.upsert_service_report(null, $1::jsonb)", [JSON.stringify({ company_id: s.companyId })]), /작성 권한/);
    });
  });

  test("채번 SR-YYYYMMDD-NNNNN + INSERT는 항상 draft로 강제(issued 직행 차단)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s);
      expect(row.seq_no).toMatch(/^SR-\d{8}-\d{5,}$/);
      expect(row.status).toBe("draft");
      // postgres 직삽도 BI 트리거가 draft로 강제
      await asPostgres(c);
      const r = await c.query(
        "insert into public.service_reports (status, customer_name, device_name, created_by) values ('issued','x','y',$1) returning status, seq_no",
        [ENG1],
      );
      expect(r.rows[0].status).toBe("draft");
    });
  });

  test("금액 서버 재계산: paid=visit+parts+vat(round), free=전액 0", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const paid = await createDraft(s);
      expect(paid.parts_total).toBe(30000);
      expect(paid.vat).toBe(Math.round(120000 * 0.1));
      expect(paid.total).toBe(120000 + 12000);
      const free = await createDraft(s, { charge_type: "free", free_reason: "보증기간 내" });
      expect(free.total).toBe(0);
      expect(free.visit_fee).toBe(0);
      expect(free.free_reason).toBe("보증기간 내");
    });
  });

  test("입력 캡: 부품 31행·고장 21개 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, ENG1);
      const manyParts = Array.from({ length: 31 }, (_, i) => ({ name: `p${i}`, qty: 1, price: 1 }));
      await expectReject(() => createDraft(s, { parts: manyParts }), /최대 30행/);
      const manyFaults = Array.from({ length: 21 }, (_, i) => `f${i}`);
      await expectReject(() => createDraft(s, { faults: manyFaults }), /최대 20개/);
    });
  });

  test("교차 링크 위조: 타 고객의 신청/장비 연결 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const other = await c.query("insert into public.companies (name) values ('남의회사') returning id");
      await asUser(c, ENG1);
      await expectReject(() => createDraft(s, { company_id: other.rows[0].id }), /고객의 것이 아닙니다/);
    });
  });
});

describe("service_reports — 확정(issue)", () => {
  test("서명 없으면 확정 거부 / 경로만 있고 객체 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s);
      await expectReject(() => c.query("select public.issue_service_report($1)", [row.id]), /서명이 필요/);
      // 경로만 세팅(객체 미업로드)
      await asUser(c, ENG1);
      await c.query("select public.upsert_service_report($1, $2::jsonb)", [
        row.id,
        JSON.stringify({
          company_id: s.companyId, company_equipment_id: s.equipmentId, service_request_id: s.requestId,
          faults: ["접촉불량"], diagnosis: "d", action_text: "a", charge_type: "paid", visit_fee: 1000,
          signature_path: `${row.id}/signature.png`,
        }),
      ]);
      await expectReject(() => c.query("select public.issue_service_report($1)", [row.id]), /업로드되지 않았/);
    });
  });

  test("확정 성공: issued+스냅샷(기사 이름·직책·하이웍스)+연결 신청 done 전이", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s);
      await attachSignature(row.id as string, {}, s);
      const r = await c.query("select public.issue_service_report($1) as row", [row.id]);
      const issued = r.rows[0].row as Record<string, unknown>;
      expect(issued.status).toBe("issued");
      expect(issued.engineer_name).toBe("홍기사");
      expect(issued.engineer_title).toBe("기술팀 과장");
      expect(issued.sender_hiworks_user_id).toBe("eng1");
      await asPostgres(c);
      const req = await c.query("select status from public.service_requests where id=$1", [s.requestId]);
      expect(req.rows[0].status).toBe("done");
      // PDF 잡 enqueue 확인
      const job = await c.query(
        "select count(*)::int as n from public.jobs where type='service_report_pdf' and payload->>'service_report_id'=$1",
        [row.id],
      );
      expect(job.rows[0].n).toBe(1);
    });
  });

  test("후속조치 필요 시 신청 상태 유지(전이 없음)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s, { follow_needed: true, follow_memo: "부품 수급 후 재방문" });
      await attachSignature(row.id as string, { follow_needed: true, follow_memo: "부품 수급 후 재방문" }, s);
      await c.query("select public.issue_service_report($1)", [row.id]);
      await asPostgres(c);
      const req = await c.query("select status from public.service_requests where id=$1", [s.requestId]);
      expect(req.rows[0].status).toBe("received");
    });
  });

  test("종결 레이스: 신청이 이미 done이어도 확정은 성공(전이 no-op)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s);
      await attachSignature(row.id as string, {}, s);
      await asPostgres(c);
      await c.query("update public.service_requests set status='done' where id=$1", [s.requestId]);
      await asUser(c, ENG1);
      const r = await c.query("select public.issue_service_report($1) as row", [row.id]);
      expect((r.rows[0].row as Record<string, unknown>).status).toBe("issued");
    });
  });

  test("무상인데 사유 없으면 확정 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s, { charge_type: "free" });
      await attachSignature(row.id as string, { charge_type: "free" }, s);
      await expectReject(() => c.query("select public.issue_service_report($1)", [row.id]), /무상 사유/);
    });
  });

  test("신규 고객(직접입력): 확정 시 companies 생성, biz_no 완전일치면 기존 연결", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      // (a) 미등록 사업자번호 → 신규 생성(assignee=기사)
      const rowA = await createDraft(s, {
        company_id: null, company_equipment_id: null, service_request_id: null,
        customer_name: "신규거래처", customer_biz_no: "9998887771", customer_tel: "010-1", customer_addr: "서울",
        device_name: "미등록장비 X1", device_serial: "SN-X1",
      });
      await attachSignature(rowA.id as string, {
        company_id: null, company_equipment_id: null, service_request_id: null,
        customer_name: "신규거래처", customer_biz_no: "9998887771",
        device_name: "미등록장비 X1", device_serial: "SN-X1",
      }, s);
      const rA = await c.query("select public.issue_service_report($1) as row", [rowA.id]);
      const issuedA = rA.rows[0].row as Record<string, unknown>;
      expect(issuedA.company_id).toBeTruthy();
      await asPostgres(c);
      const co = await c.query("select name, assignee_id from public.companies where id=$1", [issuedA.company_id]);
      expect(co.rows[0].name).toBe("신규거래처");
      expect(co.rows[0].assignee_id).toBe(ENG1);
      // 직접입력 장비 행도 생성(label — 이후 이력 누적)
      const ce = await c.query("select label, serial_no from public.company_equipment where id=$1", [issuedA.company_equipment_id]);
      expect(ce.rows[0].label).toBe("미등록장비 X1");
      // (b) 기존 사업자번호 완전일치 → 기존 고객 연결(중복 INSERT 없음)
      const rowB = await createDraft(s, {
        company_id: null, company_equipment_id: null, service_request_id: null,
        customer_name: "리포트상사(직접입력)", customer_biz_no: "3334445551", device_name: "JU-2513UV",
      });
      await attachSignature(rowB.id as string, {
        company_id: null, company_equipment_id: null, service_request_id: null,
        customer_name: "리포트상사(직접입력)", customer_biz_no: "3334445551", device_name: "JU-2513UV",
      }, s);
      const rB = await c.query("select public.issue_service_report($1) as row", [rowB.id]);
      expect((rB.rows[0].row as Record<string, unknown>).company_id).toBe(s.companyId);
    });
  });
});

describe("service_reports — 발행 동결·voided·후속 처리", () => {
  async function issuedReport(s: Seeded): Promise<string> {
    const row = await createDraft(s);
    await attachSignature(row.id as string, {}, s);
    await c.query("select public.issue_service_report($1)", [row.id]);
    return row.id as string;
  }

  test("발행 후 내용 수정은 service_role도 거부, pdf_url·후속 처리만 허용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const id = await issuedReport(s);
      await asService(c);
      await expectReject(() => c.query("update public.service_reports set diagnosis='조작' where id=$1", [id]), /수정할 수 없습니다/);
      await c.query("update public.service_reports set pdf_url='r/x.pdf' where id=$1", [id]); // 허용
    });
  });

  test("voided: 관리자만·사유 필수·이후 pdf_url 갱신도 차단(종단)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const id = await issuedReport(s);
      await asUser(c, ENG1);
      await expectReject(() => c.query("select public.void_service_report($1,'오타')", [id]), /관리자 전용/);
      await asUser(c, UID.admin);
      await expectReject(() => c.query("select public.void_service_report($1,'  ')", [id]), /사유가 필요/);
      const r = await c.query("select public.void_service_report($1,'금액 오타 — 재작성') as row", [id]);
      expect((r.rows[0].row as Record<string, unknown>).status).toBe("voided");
      await asService(c);
      await expectReject(() => c.query("update public.service_reports set pdf_url='r/y.pdf' where id=$1", [id]), /무효화된 리포트/);
    });
  });

  test("후속조치 처리 완료(resolve)는 발행 동결의 예외로 허용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s, { follow_needed: true, follow_memo: "재방문" });
      await attachSignature(row.id as string, { follow_needed: true, follow_memo: "재방문" }, s);
      await c.query("select public.issue_service_report($1)", [row.id]);
      await asUser(c, ENG1);
      const r = await c.query("select public.resolve_service_report_follow($1) as row", [row.id]);
      expect((r.rows[0].row as Record<string, unknown>).follow_resolved_at).toBeTruthy();
    });
  });
});

describe("service_reports — 메일 enqueue(pdf_url 기록 시)·멱등", () => {
  test("recipient+발신자 스냅샷 있으면 email_log+잡 1건, 재기록엔 중복 없음", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const row = await createDraft(s);
      await attachSignature(row.id as string, {}, s);
      await c.query("select public.issue_service_report($1)", [row.id]);
      await asService(c); // 워커가 PDF 완료 → pdf_url 기록
      await c.query("update public.service_reports set pdf_url='r/a.pdf' where id=$1", [row.id]);
      await asPostgres(c);
      const logs = await c.query(
        "select count(*)::int as n from public.email_log where service_report_id=$1", [row.id]);
      expect(logs.rows[0].n).toBe(1);
      const jobs = await c.query(
        "select count(*)::int as n from public.jobs where type='service_report_email' and payload->>'service_report_id'=$1",
        [row.id],
      );
      expect(jobs.rows[0].n).toBe(1);
    });
  });

  test("수신 이메일 없으면 확정·PDF는 되고 메일은 생략", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      await c.query("update public.companies set email=null where id=$1", [s.companyId]);
      const row = await createDraft(s, { recipient_email: null });
      await attachSignature(row.id as string, { recipient_email: null }, s);
      await c.query("select public.issue_service_report($1)", [row.id]);
      await asService(c);
      await c.query("update public.service_reports set pdf_url='r/b.pdf' where id=$1", [row.id]);
      await asPostgres(c);
      const logs = await c.query(
        "select count(*)::int as n from public.email_log where service_report_id=$1", [row.id]);
      expect(logs.rows[0].n).toBe(0);
    });
  });
});

describe("service_reports — RLS 열람·기사용 신청 조회·스토리지 정책", () => {
  test("타 기사 draft는 안 보이고, 발행본은 write 보유자 전원 열람(이력 카드)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const draft = await createDraft(s);
      await asUser(c, ENG2);
      const hidden = await c.query("select count(*)::int as n from public.service_reports where id=$1", [draft.id]);
      expect(hidden.rows[0].n).toBe(0);
      await asUser(c, ENG1);
      await attachSignature(draft.id as string, {}, s);
      await c.query("select public.issue_service_report($1)", [draft.id]);
      await asUser(c, ENG2);
      const visible = await c.query("select count(*)::int as n from public.service_reports where id=$1", [draft.id]);
      expect(visible.rows[0].n).toBe(1);
    });
  });

  test("list_open_service_requests: 비담당 기사도 미종결 신청 조회(RLS 홀 해소)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      // 직접 SELECT는 0건(assignee 아님·view_all 없음)
      await asUser(c, ENG1);
      const direct = await c.query("select count(*)::int as n from public.service_requests where company_id=$1", [s.companyId]);
      expect(direct.rows[0].n).toBe(0);
      const r = await c.query("select public.list_open_service_requests($1) as list", [s.companyId]);
      const list = r.rows[0].list as { symptom: string }[];
      expect(list).toHaveLength(1);
      expect(list[0].symptom).toBe("출력 안 됨");
      // write 없는 계정은 거부
      await asUser(c, UID.sales1);
      await expectReject(() => c.query("select public.list_open_service_requests($1)", [s.companyId]), /권한/);
    });
  });

  test("스토리지: 타 기사 draft 폴더 업로드 거부·본인 draft 허용·발행 후 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const draft = await createDraft(s);
      const put = (name: string) =>
        c.query("insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{\"size\":10}'::jsonb)", [name]);
      await asUser(c, ENG2);
      await expectReject(() => put(`${draft.id}/before-1.jpg`), /row-level security/);
      await asUser(c, ENG1);
      await put(`${draft.id}/before-1.jpg`); // 본인 draft — 허용
      await expectReject(() => put(`${draft.id}/before-9.jpg`), /row-level security/); // 슬롯 초과 경로
      await attachSignature(draft.id as string, { photos_before: [`${draft.id}/before-1.jpg`] }, s);
      await c.query("select public.issue_service_report($1)", [draft.id]);
      await asUser(c, ENG1);
      await expectReject(() => put(`${draft.id}/after-1.jpg`), /row-level security/); // 발행 후 차단
    });
  });
});
