import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

// enqueue_quote_email RPC — 발송 결선(권한·행스코프·검증·멱등 enqueue) db-test.
// sales1=email.send + hiworks_user_id, sales2=권한없음, admin=applications.view_all.

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// 발행본(issued) + pdf_url 있는 견적을 시드하고 quote_id 반환. assignee 지정 가능.
async function seedIssuedQuote(assignee: string): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query("update public.profiles set permissions='{email.send}', hiworks_user_id='hong' where id=$1", [UID.sales1]);
  await c.query("update public.profiles set permissions='{applications.view_all,email.send}' where id=$1", [UID.admin]);
  const app = await c.query(
    "insert into public.applications (company, email) values ('재현테크','cust@x.com') returning id",
  );
  const appId = app.rows[0].id as string;
  const q = await c.query(
    "insert into public.quotes (application_id, status, assignee_id) values ($1,'issued',$2) returning id",
    [appId, assignee],
  );
  const qid = q.rows[0].id as string;
  await c.query("update public.quotes set pdf_url='q.pdf' where id=$1", [qid]); // 발행본 pdf_url 갱신은 동결 트리거 예외
  return qid;
}

async function enqueue(qid: string, to = "cust@x.com", cc: string | null = null): Promise<unknown> {
  const r = await c.query("select public.enqueue_quote_email($1,$2,$3,null,'견적서','본문') as out", [qid, to, cc]);
  return r.rows[0].out;
}

describe("enqueue_quote_email — 권한·행스코프", () => {
  test("email.send 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales2);
      await expect(enqueue(qid)).rejects.toThrow();
    });
  });

  test("배정도 아니고 view_all도 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      // sales2에게 email.send만 주고 배정은 sales1 → 행 스코프 위반
      await asPostgres(c);
      await c.query("update public.profiles set permissions='{email.send}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      await expect(enqueue(qid)).rejects.toThrow();
    });
  });
});

describe("enqueue_quote_email — 발송 전제", () => {
  test("미발행(draft) 견적은 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asPostgres(c);
      // 동결 우회: replica로 status를 draft로 되돌려 전제 위반 케이스 구성
      await c.query("set session_replication_role = replica");
      await c.query("update public.quotes set status='draft' where id=$1", [qid]);
      await c.query("set session_replication_role = origin");
      await asUser(c, UID.sales1);
      await expect(enqueue(qid)).rejects.toThrow(/발행된 견적/);
    });
  });

  test("pdf_url 없으면(PDF 미생성) 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asPostgres(c);
      await c.query("update public.quotes set pdf_url=null where id=$1", [qid]);
      await asUser(c, UID.sales1);
      await expect(enqueue(qid)).rejects.toThrow(/PDF/);
    });
  });

  test("발송자 hiworks_user_id 없으면 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asPostgres(c);
      await c.query("update public.profiles set hiworks_user_id=null where id=$1", [UID.sales1]);
      await asUser(c, UID.sales1);
      await expect(enqueue(qid)).rejects.toThrow(/하이웍스/);
    });
  });
});

describe("enqueue_quote_email — 입력 검증", () => {
  test("받는 사람 이메일 형식 오류 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await expect(enqueue(qid, "not-an-email")).rejects.toThrow();
    });
  });

  test("수신처에 개행·다중주소 주입 거부", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await expect(enqueue(qid, "a@b.com\nbcc:evil@x.com")).rejects.toThrow();
      await expect(enqueue(qid, "a@b.com,c@d.com")).rejects.toThrow();
    });
  });

  // 실패 쿼리는 txn을 abort시키므로 본문·제목 캡은 각각 별도 rollback txn에서 단언.
  test("본문 길이 서버 캡(웹 검증 우회 방지)", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await expect(
        c.query("select public.enqueue_quote_email($1,$2,null,null,'제목',$3)", [qid, "cust@x.com", "x".repeat(5001)]),
      ).rejects.toThrow(/본문/);
    });
  });

  test("제목 길이 서버 캡", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await expect(
        c.query("select public.enqueue_quote_email($1,$2,null,null,$3,'본문')", [qid, "cust@x.com", "y".repeat(201)]),
      ).rejects.toThrow(/제목/);
    });
  });
});

describe("enqueue_quote_email — 정상 + 멱등", () => {
  test("정상 enqueue → email_log(pending) + jobs(email, payload.email_log_id) + from_user_id=auth.uid()", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = (await enqueue(qid)) as { email_log_id: string };
      expect(out.email_log_id).toBeTruthy();

      await asPostgres(c);
      const log = await c.query(
        "select status, from_user_id, to_email, quote_id from public.email_log where id=$1",
        [out.email_log_id],
      );
      expect(log.rows[0].status).toBe("pending");
      expect(log.rows[0].from_user_id).toBe(UID.sales1); // 서버가 auth.uid()로 강제
      expect(log.rows[0].to_email).toBe("cust@x.com");

      const job = await c.query(
        "select type, payload from public.jobs where payload->>'email_log_id'=$1",
        [out.email_log_id],
      );
      expect(job.rowCount).toBe(1);
      expect(job.rows[0].type).toBe("email");
      expect(job.rows[0].payload.from_user_id).toBe(UID.sales1);
      expect(job.rows[0].payload.hiworks_user_id).toBe("hong");
      expect(job.rows[0].payload.quote_id).toBe(qid);
    });
  });

  test("클라가 다른 발송자를 못 넣는다(시그니처상 user_id 인자 자체가 없음 → auth.uid() 고정)", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      const out = (await enqueue(qid)) as { email_log_id: string };
      await asPostgres(c);
      const log = await c.query("select from_user_id from public.email_log where id=$1", [out.email_log_id]);
      expect(log.rows[0].from_user_id).toBe(UID.sales1);
    });
  });

  test("중복 enqueue 거부(pending 존재 시 두 번째 호출 예외)", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asUser(c, UID.sales1);
      await enqueue(qid);
      await expect(enqueue(qid)).rejects.toThrow(/이미 발송/);
    });
  });

  test("부분 유니크 인덱스: 같은 견적 활성 발송 2건 동시 불가(중복 INSERT 차단)", async () => {
    await inRollbackTx(c, async () => {
      const qid = await seedIssuedQuote(UID.sales1);
      await asService(c);
      await c.query(
        "insert into public.email_log (quote_id, to_email, status) values ($1,'a@b.com','sent')",
        [qid],
      );
      await expect(
        c.query("insert into public.email_log (quote_id, to_email, status) values ($1,'a@b.com','pending')", [qid]),
      ).rejects.toThrow();
    });
  });
});

describe("email_log 상태기계", () => {
  test("'sending' 상태 허용(워커 CAS 전이용)", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const r = await c.query(
        "insert into public.email_log (to_email, status) values ('a@b.com','sending') returning status",
      );
      expect(r.rows[0].status).toBe("sending");
    });
  });

  test("CAS: pending→sending 1회만 성공(이미 sending이면 0행)", async () => {
    await inRollbackTx(c, async () => {
      await asService(c);
      const ins = await c.query(
        "insert into public.email_log (to_email, status) values ('a@b.com','pending') returning id",
      );
      const id = ins.rows[0].id as string;
      const first = await c.query("update public.email_log set status='sending' where id=$1 and status='pending'", [id]);
      expect(first.rowCount).toBe(1);
      const second = await c.query("update public.email_log set status='sending' where id=$1 and status='pending'", [id]);
      expect(second.rowCount).toBe(0); // 이미 sending → 재발송 방지
    });
  });
});
