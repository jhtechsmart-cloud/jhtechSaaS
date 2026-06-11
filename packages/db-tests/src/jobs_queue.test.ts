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

const APP = "00000000-0000-0000-0000-00000000e001";

async function seedApp(): Promise<void> {
  await asPostgres(c);
  await c.query("insert into public.applications (id, company) values ($1,'견적대상')", [APP]);
}

// 견적 1건 insert(트리거가 채번). 반환 id.
async function insertQuote(status: "draft" | "issued"): Promise<string> {
  const r = await c.query(
    "insert into public.quotes (application_id, status) values ($1,$2) returning id",
    [APP, status],
  );
  return r.rows[0].id;
}

describe("jobs 큐 — 발행 시 enqueue 트리거", () => {
  test("issued 견적 → quote_pdf 잡 1건(queued, payload.quote_id)", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      const qid = await insertQuote("issued");
      const j = await c.query("select type, status, payload from public.jobs where (payload->>'quote_id')=$1", [qid]);
      expect(j.rowCount).toBe(1);
      expect(j.rows[0].type).toBe("quote_pdf");
      expect(j.rows[0].status).toBe("queued");
    });
  });

  test("draft 견적 → 잡 없음", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("draft");
      const j = await c.query("select count(*)::int n from public.jobs");
      expect(j.rows[0].n).toBe(0);
    });
  });

  test("issued 행 pdf_url 갱신 → 잡 재생성 안 함(여전히 1건)", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      const qid = await insertQuote("issued");
      await c.query("update public.quotes set pdf_url='x.pdf' where id=$1", [qid]);
      const j = await c.query("select count(*)::int n from public.jobs where (payload->>'quote_id')=$1", [qid]);
      expect(j.rows[0].n).toBe(1);
    });
  });
});

describe("claim_next_job — FOR UPDATE SKIP LOCKED 클레임", () => {
  test("queued 잡 클레임 → processing·attempts=1, 재클레임은 null", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("issued");
      const a = await c.query("select public.claim_next_job() as j");
      expect(a.rows[0].j).not.toBeNull();
      expect(a.rows[0].j.status).toBe("processing");
      expect(a.rows[0].j.attempts).toBe(1);
      const b = await c.query("select public.claim_next_job() as j");
      expect(b.rows[0].j).toBeNull();
    });
  });
});

describe("claim_next_job — 스테일 processing 회수(가시성 타임아웃)", () => {
  // 워커가 잡을 claim한 채 죽으면(재배포 SIGKILL·OOM) processing으로 영구 방치되던 구멍.
  // 5분 넘게 processing이면 죽은 워커로 간주하고 다시 claim할 수 있어야 한다.
  test("5분 넘게 processing인 잡은 다시 claim된다(attempts 증가)", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("issued");
      const a = await c.query("select public.claim_next_job() as j");
      const id = a.rows[0].j.id as string;
      // 워커 사망 시뮬레이션 — updated_at을 6분 전으로 백데이트
      await c.query("update public.jobs set updated_at = now() - interval '6 minutes' where id=$1", [id]);
      const b = await c.query("select public.claim_next_job() as j");
      expect(b.rows[0].j).not.toBeNull();
      expect(b.rows[0].j.id).toBe(id);
      expect(b.rows[0].j.status).toBe("processing");
      expect(b.rows[0].j.attempts).toBe(2);
    });
  });

  test("5분 미만 processing 잡은 회수되지 않는다", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("issued");
      const a = await c.query("select public.claim_next_job() as j");
      const id = a.rows[0].j.id as string;
      await c.query("update public.jobs set updated_at = now() - interval '4 minutes' where id=$1", [id]);
      const b = await c.query("select public.claim_next_job() as j");
      expect(b.rows[0].j).toBeNull();
    });
  });

  test("시도 한도(3회)를 소진한 스테일 잡은 회수하지 않는다(크래시 무한루프 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("issued");
      const a = await c.query("select public.claim_next_job() as j");
      const id = a.rows[0].j.id as string;
      await c.query(
        "update public.jobs set attempts = 3, updated_at = now() - interval '6 minutes' where id=$1",
        [id],
      );
      const b = await c.query("select public.claim_next_job() as j");
      expect(b.rows[0].j).toBeNull();
    });
  });
});

describe("jobs RLS — 내부 전용", () => {
  test("anon은 jobs를 못 본다", async () => {
    await inRollbackTx(c, async () => {
      await seedApp();
      await insertQuote("issued");
      await asAnon(c);
      const r = await c.query("select * from public.jobs");
      expect(r.rowCount).toBe(0);
    });
  });
});
