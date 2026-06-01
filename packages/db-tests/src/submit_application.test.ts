import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// payload 헬퍼
// v2는 privacy_consent=true + version 필수, biz_no 체크섬 재검증, equipment_id를 active 장비로 검증한다.
// 따라서 기본 payload는 유효 biz_no("1234567891")를 쓰고 존재하지 않는 equipment_id는 넣지 않는다.
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    company: "RPC상사",
    ceo: "홍길동",
    biz_no: "1234567891",
    phone: "0212345678",
    email: "a@b.com",
    address: "서울",
    privacy_consent: true,
    privacy_consent_version: "v1.0",
    fields: { requirements: "테스트" },
    ...over,
  });

describe("submit_application RPC (E3 P2)", () => {
  test("anon EXECUTE → REQ- 접수번호 반환 + 행 저장(new·미배정·submitted_at·fields)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select public.submit_application($1::jsonb) as seq", [payload()]);
      expect(r.rows[0].seq).toMatch(/^REQ-\d{8}-\d{5,}$/);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id, submitted_at, fields, company from public.applications where company='RPC상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
      expect(row.rows[0].submitted_at).not.toBeNull();
      expect(row.rows[0].fields.requirements).toBe("테스트");
    });
  });

  test("company 누락/공백 → 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ company: "   " })]),
      ).rejects.toThrow();
    });
  });

  test("company 키가 아예 없으면 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [JSON.stringify({})]),
      ).rejects.toThrow();
    });
  });

  test("길이 캡 초과(company 201자) → 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ company: "가".repeat(201) })]),
      ).rejects.toThrow();
    });
  });

  test("payload의 status·assignee_id는 무시되고 new·null 강제", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [
        payload({ company: "강제상사", status: "closed", assignee_id: "00000000-0000-0000-0000-0000000000b1" }),
      ]);
      await asPostgres(c);
      const row = await c.query(
        "select status, assignee_id from public.applications where company='강제상사'",
      );
      expect(row.rows[0].status).toBe("new");
      expect(row.rows[0].assignee_id).toBeNull();
    });
  });

  test("anon은 RPC로 저장해도 applications를 직접 SELECT 못 한다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [payload({ company: "비밀상사" })]);
      const r = await c.query("select id from public.applications");
      expect(r.rowCount).toBe(0);
    });
  });

  test("다회 호출 시 seq_no 유일", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const a = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일1" })]);
      const b = await c.query("select public.submit_application($1::jsonb) as seq", [payload({ company: "유일2" })]);
      expect(a.rows[0].seq).not.toBe(b.rows[0].seq);
    });
  });

  test("동의(privacy_consent=true) 저장 + version·at 기록, equipment_id 컬럼 기록", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await c.query(
        "insert into public.equipment (id, name, status) values ('00000000-0000-0000-0000-0000000000e1','테스트장비','active')",
      );
      await asAnon(c);
      await c.query("select public.submit_application($1::jsonb)", [
        payload({ company: "동의상사", equipment_id: "00000000-0000-0000-0000-0000000000e1" }),
      ]);
      await asPostgres(c);
      const row = await c.query(
        "select privacy_consent, privacy_consent_version, privacy_consent_at, equipment_id from public.applications where company='동의상사'",
      );
      expect(row.rows[0].privacy_consent).toBe(true);
      expect(row.rows[0].privacy_consent_version).toBe("v1.0");
      expect(row.rows[0].privacy_consent_at).not.toBeNull();
      expect(row.rows[0].equipment_id).toBe("00000000-0000-0000-0000-0000000000e1");
    });
  });

  test("privacy_consent≠true면 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ privacy_consent: false })]),
      ).rejects.toThrow();
    });
  });

  test("느슨한 동의값(문자열 'true'·숫자 1)은 거부된다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ privacy_consent: "true" })]),
      ).rejects.toThrow();
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ privacy_consent: 1 })]),
      ).rejects.toThrow();
    });
  });

  test("photos 경로 형식 위반 시 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [
          payload({ fields: { photos: { ext_entrance: "../evil.jpg" } } }),
        ]),
      ).rejects.toThrow();
    });
  });

  test("허용되지 않은 photos 슬롯 키는 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [
          payload({ fields: { photos: { evil_slot: "customer-uploads/00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg" } } }),
        ]),
      ).rejects.toThrow();
    });
  });

  test("유효한 photos 경로(버킷-상대 <uuid>/<slot>.ext)는 저장된다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const validPath = "00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg";
      await c.query("select public.submit_application($1::jsonb)", [
        payload({ company: "사진상사", fields: { photos: { ext_entrance: validPath } } }),
      ]);
      await asPostgres(c);
      const row = await c.query("select fields from public.applications where company='사진상사'");
      expect(row.rows[0].fields.photos.ext_entrance).toBe(validPath);
    });
  });

  test("버킷명 prefix가 붙은 옛 경로(customer-uploads/...)는 거부된다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [
          payload({
            fields: { photos: { ext_entrance: "customer-uploads/00000000-0000-0000-0000-0000000000ff/ext_entrance.jpg" } },
          }),
        ]),
      ).rejects.toThrow();
    });
  });

  test("존재하지 않는 동의 버전은 거부된다", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ privacy_consent_version: "v999" })]),
      ).rejects.toThrow();
    });
  });

  test("biz_no 체크섬 불일치 시 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [payload({ biz_no: "1234567890" })]),
      ).rejects.toThrow();
    });
  });

  test("존재하지 않는 equipment_id는 예외", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("select public.submit_application($1::jsonb)", [
          payload({ equipment_id: "00000000-0000-0000-0000-00000000dead" }),
        ]),
      ).rejects.toThrow();
    });
  });
});
