import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// 장비출고의뢰서 — 채번·1:1·RLS·발행본 불변.
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function seedApp(): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
  const a = await c.query("insert into public.applications (company, email) values ('애드넷','c@x.com') returning id");
  return a.rows[0].id as string;
}

describe("release_orders — 채번·1:1·RLS·불변", () => {
  test("write 권한+배정자는 INSERT, seq_no 자동 채번(REL-)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asPostgres(c);
      await c.query("update public.applications set assignee_id=$1 where id=$2", [UID.sales1, appId]);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','애드넷') returning seq_no, status",
        [appId],
      );
      expect(r.rows[0].seq_no).toMatch(/^REL-\d{8}-\d{5}$/);
      expect(r.rows[0].status).toBe("draft");
    });
  });

  test("권한 없으면 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asUser(c, UID.sales2); // 권한 없음
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("의뢰당 1건만(UNIQUE application_id)", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      await c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'printer','x')", [appId]);
      await expect(
        c.query("insert into public.release_orders (application_id, device_kind, company) values ($1,'cutter','y')", [appId]),
      ).rejects.toThrow();
    });
  });

  test("발행본(issued)은 device_kind 동결(불변 트리거), pdf_url은 허용", async () => {
    await inRollbackTx(c, async () => {
      const appId = await seedApp();
      await asService(c);
      const r = await c.query(
        "insert into public.release_orders (application_id, device_kind, company, status) values ($1,'printer','x','issued') returning id",
        [appId],
      );
      const id = r.rows[0].id as string;
      const okPdf = await c.query("update public.release_orders set pdf_url='p.pdf' where id=$1 returning id", [id]);
      expect(okPdf.rowCount).toBe(1);
      await expect(
        c.query("update public.release_orders set device_kind='cutter' where id=$1", [id]),
      ).rejects.toThrow();
    });
  });
});

// ── 작성/발행 RPC (upsert_release_order / issue_release_order) ──
// 스냅샷(company·phone·address·device_name·install_at·quote_id)은 서버가 application/quote에서 채운다(클라 미신뢰).

// 회사·전화·주소·설치설문 있는 의뢰 + 발행 견적(품목·납품일정) 시드. assignee 지정 가능.
async function seedAppWithIssuedQuote(assignee: string | null): Promise<{ appId: string; quoteId: string }> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  const a = await c.query(
    `insert into public.applications (company, phone, address, fields, assignee_id)
     values ('애드넷','010-1234-5678','서울시 강남구 1','{"install_survey":{"power":"single_220","building_type":"factory"}}',$1)
     returning id`,
    [assignee],
  );
  const appId = a.rows[0].id as string;
  // 발행 견적(품목 1줄 + 납품일정) — 서버 스냅샷 출처
  const q = await c.query(
    `insert into public.quotes (application_id, status, assignee_id, items, delivery_date, delivery_time)
     values ($1,'issued',$2,'[{"name":"UV3300S"}]','2026-07-01','13:30:00') returning id`,
    [appId, assignee],
  );
  return { appId, quoteId: q.rows[0].id as string };
}

async function upsert(appId: string, kind = "printer", details = "{}"): Promise<{ id: string }> {
  const r = await c.query("select public.upsert_release_order($1,$2,$3::jsonb) as out", [appId, kind, details]);
  return r.rows[0].out as { id: string };
}

describe("upsert_release_order — 권한·행스코프·서버 스냅샷·1:1", () => {
  test("write 권한+배정자: draft 생성 + 스냅샷을 서버가 application/quote에서 채움", async () => {
    await inRollbackTx(c, async () => {
      const { appId, quoteId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      expect(out.id).toBeTruthy();

      await asPostgres(c);
      const row = await c.query(
        `select status, device_kind, company, contact_phone, install_address, device_name,
                quote_id, install_at, seq_no from public.release_orders where id=$1`,
        [out.id],
      );
      const r = row.rows[0];
      expect(r.status).toBe("draft");
      expect(r.device_kind).toBe("printer");
      // 클라가 안 보낸 스냅샷을 서버가 채운다
      expect(r.company).toBe("애드넷");
      expect(r.contact_phone).toBe("010-1234-5678");
      expect(r.install_address).toBe("서울시 강남구 1");
      expect(r.device_name).toBe("UV3300S");
      expect(r.quote_id).toBe(quoteId);
      expect(r.install_at).not.toBeNull(); // 납품일정 → install_at 채움
      expect(r.seq_no).toMatch(/^REL-\d{8}-\d{5}$/);
    });
  });

  test("고객정보 편집: 클라가 보낸 회사·연락처·주소를 저장(스냅샷 덮어씀)", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "select public.upsert_release_order($1,$2,$3::jsonb,$4,$5,$6) as out",
        [appId, "printer", "{}", "수정한회사", "010-9999-0000", "부산시 해운대구 99"],
      );
      const out = r.rows[0].out as { id: string };
      await asPostgres(c);
      const row = await c.query(
        "select company, contact_phone, install_address from public.release_orders where id=$1",
        [out.id],
      );
      expect(row.rows[0].company).toBe("수정한회사");
      expect(row.rows[0].contact_phone).toBe("010-9999-0000");
      expect(row.rows[0].install_address).toBe("부산시 해운대구 99");
    });
  });

  test("고객정보 빈 값이면 application 값으로 폴백", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const r = await c.query(
        "select public.upsert_release_order($1,$2,$3::jsonb,$4,$5,$6) as out",
        [appId, "printer", "{}", "  ", "", null],
      );
      const out = r.rows[0].out as { id: string };
      await asPostgres(c);
      const row = await c.query(
        "select company, contact_phone, install_address from public.release_orders where id=$1",
        [out.id],
      );
      expect(row.rows[0].company).toBe("애드넷"); // 폴백
      expect(row.rows[0].contact_phone).toBe("010-1234-5678");
      expect(row.rows[0].install_address).toBe("서울시 강남구 1");
    });
  });

  test("release_orders.write 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales2); // 권한 없음
      await expect(upsert(appId)).rejects.toThrow();
    });
  });

  test("배정도 아니고 view_all도 없으면 거부(행 스코프)", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1); // sales1 배정
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2); // write는 있으나 미배정
      await expect(upsert(appId)).rejects.toThrow();
    });
  });

  test("잘못된 device_kind 거부", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await expect(upsert(appId, "laser")).rejects.toThrow();
    });
  });

  test("details 크기 상한 서버 강제(20KB 초과 거부)", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const huge = JSON.stringify({ blob: "x".repeat(21000) });
      await expect(upsert(appId, "printer", huge)).rejects.toThrow(/너무 큽니다/);
    });
  });

  test("같은 의뢰 두 번 upsert = 1건 갱신(1:1), seq_no 유지·device_kind 변경 반영", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const first = await upsert(appId, "printer");
      const second = await upsert(appId, "cutter");
      expect(second.id).toBe(first.id); // 같은 행 갱신

      await asPostgres(c);
      const cnt = await c.query(
        "select count(*)::int n from public.release_orders where application_id=$1",
        [appId],
      );
      expect(cnt.rows[0].n).toBe(1);
      const row = await c.query("select device_kind from public.release_orders where id=$1", [first.id]);
      expect(row.rows[0].device_kind).toBe("cutter");
    });
  });

  test("발행본은 upsert 거부(발행 후 수정 불가)", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      await c.query("select public.issue_release_order($1)", [out.id]);
      await expect(upsert(appId, "cutter")).rejects.toThrow();
    });
  });
});

describe("issue_release_order — 발행 + PDF 잡 enqueue", () => {
  test("draft→issued + release_pdf 잡 enqueue + issued_at", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      const issued = (await c.query("select public.issue_release_order($1) as out", [out.id])).rows[0].out as {
        status: string;
      };
      expect(issued.status).toBe("issued");

      await asPostgres(c);
      const row = await c.query("select status, issued_at from public.release_orders where id=$1", [out.id]);
      expect(row.rows[0].status).toBe("issued");
      expect(row.rows[0].issued_at).not.toBeNull();
      const job = await c.query(
        "select type, payload from public.jobs where payload->>'release_order_id'=$1",
        [out.id],
      );
      expect(job.rowCount).toBe(1);
      expect(job.rows[0].type).toBe("release_pdf");
    });
  });

  test("권한 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      await asUser(c, UID.sales2); // 권한 없음
      await expect(c.query("select public.issue_release_order($1)", [out.id])).rejects.toThrow();
    });
  });

  test("연결된 견적이 없으면 발행 거부(I1 가드)", async () => {
    await inRollbackTx(c, async () => {
      // 발행 견적이 없는 의뢰 → upsert는 되지만 quote_id null
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
      const a = await c.query(
        "insert into public.applications (company, assignee_id) values ('애드넷',$1) returning id",
        [UID.sales1],
      );
      const appId = a.rows[0].id as string;
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      await asPostgres(c);
      expect((await c.query("select quote_id from public.release_orders where id=$1", [out.id])).rows[0].quote_id).toBeNull();
      await asUser(c, UID.sales1);
      await expect(c.query("select public.issue_release_order($1)", [out.id])).rejects.toThrow(/견적/);
    });
  });

  test("설치 일시가 없으면 발행 거부(I1 가드)", async () => {
    await inRollbackTx(c, async () => {
      // 발행 견적은 있으나 납품일정이 없어 install_at null
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
      await c.query("update public.profiles set permissions='{release_orders.write}' where id=$1", [UID.sales1]);
      const a = await c.query(
        "insert into public.applications (company, assignee_id) values ('애드넷',$1) returning id",
        [UID.sales1],
      );
      const appId = a.rows[0].id as string;
      await c.query(
        "insert into public.quotes (application_id, status, assignee_id, items) values ($1,'issued',$2,'[{\"name\":\"UV3300S\"}]')",
        [appId, UID.sales1],
      ); // delivery_date 없음 → install_at null
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      await asPostgres(c);
      expect((await c.query("select install_at from public.release_orders where id=$1", [out.id])).rows[0].install_at).toBeNull();
      await asUser(c, UID.sales1);
      await expect(c.query("select public.issue_release_order($1)", [out.id])).rejects.toThrow(/설치/);
    });
  });

  test("이미 발행된 건 재발행 거부", async () => {
    await inRollbackTx(c, async () => {
      const { appId } = await seedAppWithIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = await upsert(appId, "printer");
      await c.query("select public.issue_release_order($1)", [out.id]);
      await expect(c.query("select public.issue_release_order($1)", [out.id])).rejects.toThrow();
    });
  });

  test("anon은 RPC 실행 권한 없음, authenticated만 있음(grant revoke)", async () => {
    await asPostgres(c);
    const r = await c.query(
      `select
         has_function_privilege('anon','public.upsert_release_order(uuid,text,jsonb,text,text,text)','execute') anon_upsert,
         has_function_privilege('anon','public.issue_release_order(uuid)','execute') anon_issue,
         has_function_privilege('authenticated','public.upsert_release_order(uuid,text,jsonb,text,text,text)','execute') auth_upsert,
         has_function_privilege('authenticated','public.issue_release_order(uuid)','execute') auth_issue`,
    );
    expect(r.rows[0].anon_upsert).toBe(false);
    expect(r.rows[0].anon_issue).toBe(false);
    expect(r.rows[0].auth_upsert).toBe(true);
    expect(r.rows[0].auth_issue).toBe(true);
  });
});
