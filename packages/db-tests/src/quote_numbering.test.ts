import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, inRollbackTx, makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const APP1 = "00000000-0000-0000-0000-00000000c001";
const APP2 = "00000000-0000-0000-0000-00000000c002";

// 오늘 KST 날짜(YYYYMMDD) — 트리거가 채번에 쓰는 값과 동일.
function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
}

// 부모 application 시드(postgres 권한 — 트리거 동작 자체에 집중).
async function seedApps(): Promise<void> {
  await asPostgres(c);
  await c.query(
    "insert into public.applications (id, company) values ($1,'견적대상1'),($2,'견적대상2')",
    [APP1, APP2],
  );
}

describe("견적번호 채번 — JHQ-YYYYMMDD-NNN-VN", () => {
  test("첫 견적 → JHQ-{오늘}-001-V1, version=1 (quote_no·version은 서버 생성)", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const r = await c.query(
        "insert into public.quotes (application_id) values ($1) returning quote_no, version",
        [APP1],
      );
      expect(r.rows[0].quote_no).toBe(`JHQ-${todayKST()}-001-V1`);
      expect(r.rows[0].version).toBe(1);
    });
  });

  test("같은 application 재발행 → 번호 유지 + version 2 (-V2)", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const v1 = await c.query(
        "insert into public.quotes (application_id) values ($1) returning quote_no",
        [APP1],
      );
      const base = v1.rows[0].quote_no.replace(/-V\d+$/, "");
      const v2 = await c.query(
        "insert into public.quotes (application_id) values ($1) returning quote_no, version",
        [APP1],
      );
      expect(v2.rows[0].version).toBe(2);
      expect(v2.rows[0].quote_no).toBe(`${base}-V2`);
    });
  });

  test("다른 application 첫 견적 → NNN 002로 증가", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      await c.query("insert into public.quotes (application_id) values ($1)", [APP1]);
      const r = await c.query(
        "insert into public.quotes (application_id) values ($1) returning quote_no",
        [APP2],
      );
      expect(r.rows[0].quote_no).toBe(`JHQ-${todayKST()}-002-V1`);
    });
  });

  test("클라가 보낸 quote_no·version은 무시되고 서버값으로 덮어씀", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const r = await c.query(
        "insert into public.quotes (application_id, quote_no, version) values ($1,'HACK-999',99) returning quote_no, version",
        [APP1],
      );
      expect(r.rows[0].quote_no).toBe(`JHQ-${todayKST()}-001-V1`);
      expect(r.rows[0].version).toBe(1);
    });
  });
});

describe("불변버전 — UPDATE 동결", () => {
  test("UPDATE로 quote_no·version·created_at를 바꾸려 해도 OLD 보존", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const ins = await c.query(
        "insert into public.quotes (application_id) values ($1) returning id, quote_no, version, created_at",
        [APP1],
      );
      const { id, quote_no, version, created_at } = ins.rows[0];
      await c.query(
        "update public.quotes set quote_no='HACK', version=99, created_at='2000-01-01' where id=$1",
        [id],
      );
      const r = await c.query("select quote_no, version, created_at from public.quotes where id=$1", [id]);
      expect(r.rows[0].quote_no).toBe(quote_no);
      expect(r.rows[0].version).toBe(version);
      expect(r.rows[0].created_at).toEqual(created_at);
    });
  });

  test("draft→issued 전환 시 issued_at 서버 자동 기록", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const ins = await c.query(
        "insert into public.quotes (application_id) values ($1) returning id, issued_at",
        [APP1],
      );
      expect(ins.rows[0].issued_at).toBeNull(); // draft는 미발행
      await c.query("update public.quotes set status='issued' where id=$1", [ins.rows[0].id]);
      const r = await c.query("select status, issued_at from public.quotes where id=$1", [ins.rows[0].id]);
      expect(r.rows[0].status).toBe("issued");
      expect(r.rows[0].issued_at).not.toBeNull();
    });
  });

  test("issued 행의 금액·items·status 수정은 예외(재발행은 새 버전)", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const ins = await c.query(
        "insert into public.quotes (application_id) values ($1) returning id",
        [APP1],
      );
      const id = ins.rows[0].id;
      await c.query("update public.quotes set status='issued' where id=$1", [id]);
      await expect(
        c.query("update public.quotes set total=123 where id=$1", [id]),
      ).rejects.toThrow();
      await expect(
        c.query("update public.quotes set items='[{\"x\":1}]' where id=$1", [id]),
      ).rejects.toThrow();
    });
  });

  test("issued 행의 pdf_url 수정은 허용(통합 PDF 워커 경로)", async () => {
    await inRollbackTx(c, async () => {
      await seedApps();
      const ins = await c.query(
        "insert into public.quotes (application_id) values ($1) returning id",
        [APP1],
      );
      const id = ins.rows[0].id;
      await c.query("update public.quotes set status='issued' where id=$1", [id]);
      await c.query("update public.quotes set pdf_url='https://x/quote.pdf' where id=$1", [id]);
      const r = await c.query("select pdf_url from public.quotes where id=$1", [id]);
      expect(r.rows[0].pdf_url).toBe("https://x/quote.pdf");
    });
  });
});

describe("연도 카운터 — next_quote_base_no()", () => {
  test("999 다음은 4자리로 확장(1000), 잘리지 않음", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const yr = Number(todayKST().slice(0, 4));
      await c.query(
        "insert into public.quote_number_counters (year, last_seq) values ($1, 998)",
        [yr],
      );
      const a = await c.query("select public.next_quote_base_no() as n");
      const b = await c.query("select public.next_quote_base_no() as n");
      expect(a.rows[0].n).toBe(`JHQ-${todayKST()}-999`);
      expect(b.rows[0].n).toBe(`JHQ-${todayKST()}-1000`);
    });
  });

  test("연도별 독립: 과거 연도 카운터는 현재 연도 채번에 영향 없음(리셋)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const yr = Number(todayKST().slice(0, 4));
      // 작년 카운터가 500까지 차 있어도 올해는 001부터.
      await c.query("insert into public.quote_number_counters (year, last_seq) values ($1, 500)", [yr - 1]);
      const a = await c.query("select public.next_quote_base_no() as n");
      expect(a.rows[0].n).toBe(`JHQ-${todayKST()}-001`);
      const prev = await c.query("select last_seq from public.quote_number_counters where year=$1", [yr - 1]);
      expect(prev.rows[0].last_seq).toBe(500); // 작년 행 불변
    });
  });
});
