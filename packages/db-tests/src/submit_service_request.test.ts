// M2 P-D #22 — submit_service_request RPC. anon 제출(서버가 모든 값 강제·검증).
// submit_application 패턴 + 소유검증(company_equipment∈company) + 미등록 허용(company_id NULL) + SLA 반환.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    biz_no: "1234567891",
    contact_company: "RPC상사",
    contact_phone: "0212345678",
    privacy_consent: true,
    privacy_consent_version: "v1.0",
    fields: { symptom: "기계가 멈춤" },
    ...over,
  });

// 등록고객 A(담당=sales1) + 보유장비 1대 시딩. {companyId, ceId} 반환.
async function seedCompanyA(): Promise<{ companyId: string; ceId: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "sr-sales1@jhtech.test");
  await c.query("update public.profiles set name='김영업' where id=$1", [UID.sales1]);
  const co = await c.query(
    "insert into public.companies (name, biz_no, assignee_id) values ('RPC상사','1234567891',$1) returning id",
    [UID.sales1],
  );
  const companyId = co.rows[0].id as string;
  const ce = await c.query(
    "insert into public.company_equipment (company_id, label) values ($1,'장비A') returning id",
    [companyId],
  );
  return { companyId, ceId: ce.rows[0].id as string };
}

describe("submit_service_request RPC — 정상 경로", () => {
  test("미등록(회사 없음) biz_no → AS- 반환 + company_id NULL 행 접수(차단 아님)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select public.submit_service_request($1::jsonb) as out", [payload()]);
      expect(r.rows[0].out.seq_no).toMatch(/^AS-\d{8}-\d{5,}$/);
      expect(r.rows[0].out.assignee_name).toBeNull();
      await asPostgres(c);
      const row = await c.query("select company_id, status, admin_read_at, assignee_id, contact_company, fields from public.service_requests where biz_no='1234567891'");
      expect(row.rows[0].company_id).toBeNull();
      expect(row.rows[0].status).toBe("received");
      expect(row.rows[0].admin_read_at).toBeNull();
      expect(row.rows[0].assignee_id).toBeNull();
      expect(row.rows[0].fields.symptom).toBe("기계가 멈춤");
    });
  });

  test("등록고객 + 보유장비 → company_id·company_equipment_id·assignee 연결 + assignee_name 반환", async () => {
    await inRollbackTx(c, async () => {
      const { companyId, ceId } = await seedCompanyA();
      await asAnon(c);
      const r = await c.query("select public.submit_service_request($1::jsonb) as out", [payload({ company_equipment_id: ceId })]);
      expect(r.rows[0].out.assignee_name).toBe("김영업");
      await asPostgres(c);
      const row = await c.query("select company_id, company_equipment_id, assignee_id from public.service_requests where biz_no='1234567891'");
      expect(row.rows[0].company_id).toBe(companyId);
      expect(row.rows[0].company_equipment_id).toBe(ceId);
      expect(row.rows[0].assignee_id).toBe(UID.sales1);
    });
  });

  test("anon은 저장 후 직접 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_service_request($1::jsonb)", [payload()]);
      expect((await c.query("select id from public.service_requests")).rowCount).toBe(0);
    });
  });

  test("payload의 status·seq_no·assignee_id·admin_read_at은 무시/강제", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_service_request($1::jsonb)", [
        payload({ status: "done", seq_no: "HACK", assignee_id: UID.sales1, admin_read_at: "2020-01-01" }),
      ]);
      await asPostgres(c);
      const row = await c.query("select status, seq_no, assignee_id, admin_read_at from public.service_requests where biz_no='1234567891'");
      expect(row.rows[0].status).toBe("received");
      expect(row.rows[0].seq_no).toMatch(/^AS-\d{8}-\d{5,}$/);
      expect(row.rows[0].assignee_id).toBeNull();
      expect(row.rows[0].admin_read_at).toBeNull();
    });
  });
});

describe("submit_service_request RPC — 소유검증·biz_no", () => {
  test("소유검증: biz_no=A + 다른회사 B의 company_equipment_id → 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedCompanyA(); // 회사 A(biz 1234567891)
      await asPostgres(c);
      const coB = await c.query("insert into public.companies (name) values ('B상사') returning id");
      const ceB = await c.query("insert into public.company_equipment (company_id, label) values ($1,'장비B') returning id", [coB.rows[0].id]);
      await asAnon(c);
      await expect(
        c.query("select public.submit_service_request($1::jsonb)", [payload({ company_equipment_id: ceB.rows[0].id })]),
      ).rejects.toThrow();
    });
  });

  test("biz_no 누락/빈문자 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ biz_no: "" })])).rejects.toThrow();
      await expect(c.query("select public.submit_service_request($1::jsonb)", [JSON.stringify({ contact_company: "x", privacy_consent: true, privacy_consent_version: "v1.0", fields: { symptom: "x" } })])).rejects.toThrow();
    });
  });

  test("biz_no 체크섬 불일치 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ biz_no: "1234567890" })])).rejects.toThrow();
    });
  });
});

describe("submit_service_request RPC — 동의·필드 검증", () => {
  test("동의 false/문자열'true'/숫자1/버전위조 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ privacy_consent: false })])).rejects.toThrow();
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ privacy_consent: "true" })])).rejects.toThrow();
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ privacy_consent: 1 })])).rejects.toThrow();
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ privacy_consent_version: "v999" })])).rejects.toThrow();
    });
  });

  test("희망일 잘못된 형식 → 거부, fields는 화이트리스트만 저장(임의 키 제거)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      // 잘못된 preferred_date 형식 (savepoint로 격리 — 예외가 txn abort시키므로)
      await c.query("savepoint sp");
      await expect(c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "x", preferred_date: "내일쯤" } }),
      ])).rejects.toThrow();
      await c.query("rollback to savepoint sp");
      // 임의 키(equipment_text·junk)는 저장 안 됨
      await c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "증상", preferred_date: "2026-07-01", equipment_text: "위조라벨", junk: "x" } }),
      ]);
      await asPostgres(c);
      const row = await c.query("select fields from public.service_requests where biz_no='1234567891'");
      expect(row.rows[0].fields.symptom).toBe("증상");
      expect(row.rows[0].fields.preferred_date).toBe("2026-07-01");
      expect(row.rows[0].fields.equipment_text).toBeUndefined();
      expect(row.rows[0].fields.junk).toBeUndefined();
    });
  });

  test("symptom 누락/길이초과 → 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ fields: {} })])).rejects.toThrow();
      await expect(c.query("select public.submit_service_request($1::jsonb)", [payload({ fields: { symptom: "가".repeat(2001) } })])).rejects.toThrow();
    });
  });

  test("photos: 유효 슬롯 저장 / 잘못된 슬롯·경로조작·4개 초과 거부", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const validPath = "00000000-0000-0000-0000-0000000000ff/as_photo_1.jpg";
      await c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "x", photos: { as_photo_1: validPath } } }),
      ]);
      await asPostgres(c);
      const row = await c.query("select fields from public.service_requests where biz_no='1234567891'");
      expect(row.rows[0].fields.photos.as_photo_1).toBe(validPath);
      await asAnon(c);
      // 허용 안된 슬롯
      await expect(c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "x", photos: { as_photo_4: validPath } } }),
      ])).rejects.toThrow();
      // 경로조작
      await expect(c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "x", photos: { as_photo_1: "../evil.jpg" } } }),
      ])).rejects.toThrow();
      // 4개 초과(as_photo_1..3만 허용)
      await expect(c.query("select public.submit_service_request($1::jsonb)", [
        payload({ fields: { symptom: "x", photos: {
          as_photo_1: "00000000-0000-0000-0000-0000000000ff/as_photo_1.jpg",
          as_photo_2: "00000000-0000-0000-0000-0000000000ff/as_photo_2.jpg",
          as_photo_3: "00000000-0000-0000-0000-0000000000ff/as_photo_3.jpg",
          as_photo_4: "00000000-0000-0000-0000-0000000000ff/as_photo_4.jpg",
        } } }),
      ])).rejects.toThrow();
    });
  });
});
